use std::collections::HashMap;
use std::env;
use std::fs::{self, TryLockError};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

trait HideWindow {
    fn hide_window(&mut self) -> &mut Self;
}

impl HideWindow for Command {
    fn hide_window(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        self.creation_flags(CREATE_NO_WINDOW);
        self
    }
}

fn cli_is_usable(path: &str) -> bool {
    Command::new(path)
        .hide_window()
        .arg("version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

// ─── Evento de progresso emitido para o frontend ──────────────────────────
#[derive(serde::Serialize, Clone)]
struct SetupProgress {
    step: String,    // "starting" | "cli" | "core" | "done" | "error"
    message: String, // Mensagem amigável para o aluno
    percent: u8,     // 0–100
}

// ─── Evento de progresso real da compilação/upload ────────────────────────
// Os tempos são enviados ao frontend e também registrados no console. Isso
// permite diagnosticar uma máquina específica sem usar animações como proxy
// para o andamento do arduino-cli.
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UploadProgress {
    stage: String,
    status: String,
    elapsed_ms: u64,
    total_elapsed_ms: u64,
}

struct AppState {
    is_reading_serial: Arc<AtomicBool>,
    // Cada início/parada cria uma geração. Isso impede que uma thread serial
    // antiga continue lendo caso outra seja iniciada antes de ela encerrar.
    serial_generation: Arc<AtomicU64>,
    is_uploading: Arc<AtomicBool>,
    setup_done: Arc<AtomicBool>,
    setup_running: Arc<AtomicBool>,
    cli_path: Arc<Mutex<String>>,
    // O setup valida os cores uma vez por sessão. Guardar o FQBN aqui evita
    // iniciar `arduino-cli core list` a cada envio, mas o pipeline ainda tem
    // fallback seguro caso esse cache não tenha sido preenchido.
    core_fqbns: Arc<Mutex<HashMap<String, String>>>,
}

// Serializa a criação do WebView do SAG. A tela pode receber resize enquanto
// monta e o Windows não permite dois WebViews com o mesmo label.
struct SagWebviewGate(Mutex<()>);

struct SetupRunGuard(Arc<AtomicBool>);

impl Drop for SetupRunGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Relaxed);
    }
}

#[derive(Clone, Copy)]
struct BoardToolchain {
    core: &'static str,
    fqbn: &'static str,
    version: &'static str,
}

fn board_toolchain(placa: &str) -> Result<BoardToolchain, String> {
    match placa {
        "uno" => Ok(BoardToolchain {
            core: "arduino:avr",
            fqbn: "arduino:avr:uno",
            version: "1.8.7",
        }),
        "nano" => Ok(BoardToolchain {
            core: "arduino:avr",
            fqbn: "arduino:avr:nano",
            version: "1.8.7",
        }),
        "esp32" => Ok(BoardToolchain {
            core: "esp32:esp32",
            fqbn: "esp32:esp32:esp32",
            version: "3.3.7",
        }),
        _ => Err("Placa não suportada pelo Bloquin.".to_string()),
    }
}

fn duration_ms(duration: Duration) -> u64 {
    duration.as_millis().min(u128::from(u64::MAX)) as u64
}

fn emit_upload_progress(
    window: &tauri::Window,
    stage: &str,
    status: &str,
    elapsed: Duration,
    total_elapsed: Duration,
) {
    let elapsed_ms = duration_ms(elapsed);
    let total_elapsed_ms = duration_ms(total_elapsed);
    println!(
        ">>> [UPLOAD][TIMING] stage={} status={} elapsed_ms={} total_ms={}",
        stage, status, elapsed_ms, total_elapsed_ms
    );
    let _ = window.emit(
        "upload-progress",
        UploadProgress {
            stage: stage.to_string(),
            status: status.to_string(),
            elapsed_ms,
            total_elapsed_ms,
        },
    );
}

fn run_timed_upload_stage<T>(
    window: &tauri::Window,
    pipeline_started: Instant,
    stage: &str,
    action: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    emit_upload_progress(
        window,
        stage,
        "started",
        Duration::from_millis(0),
        pipeline_started.elapsed(),
    );
    let stage_started = Instant::now();
    let result = action();
    let status = if result.is_ok() {
        "completed"
    } else {
        "failed"
    };
    emit_upload_progress(
        window,
        stage,
        status,
        stage_started.elapsed(),
        pipeline_started.elapsed(),
    );
    result
}

fn cache_fqbn(
    core_fqbns: &Mutex<HashMap<String, String>>,
    placa: &str,
    fqbn: String,
) -> Result<(), String> {
    let mut cache = core_fqbns
        .lock()
        .map_err(|_| "Não consegui acessar o cache de placas do Bloquin.".to_string())?;
    cache.insert(placa.to_string(), fqbn);
    Ok(())
}

fn cached_fqbn(
    core_fqbns: &Mutex<HashMap<String, String>>,
    placa: &str,
) -> Result<Option<String>, String> {
    let cache = core_fqbns
        .lock()
        .map_err(|_| "Não consegui acessar o cache de placas do Bloquin.".to_string())?;
    Ok(cache.get(placa).cloned())
}

fn build_cache_directory(root: &Path, placa: &str) -> Result<PathBuf, String> {
    let toolchain = board_toolchain(placa)?;
    // Sem ':' ou '.', para que o nome seja válido também no Windows.
    let core_name = toolchain.core.replace(':', "-");
    let version = toolchain.version.replace('.', "-");
    Ok(root.join(format!("{}-{}-{}", placa, core_name, version)))
}

// O diretório de build é deliberadamente compartilhado entre execuções para
// reaproveitar artefatos. Como duas instâncias do Bloquin podem compilar a
// mesma placa ao mesmo tempo, o arquivo de lock fica ao lado do diretório que
// o arduino-cli manipula e protege todo o ciclo compile -> upload.
fn build_cache_lock_path(build_cache_dir: &Path) -> PathBuf {
    build_cache_dir.with_extension("lock")
}

const BUILD_CACHE_LOCK_TIMEOUT: Duration = Duration::from_secs(90);
const BUILD_CACHE_LOCK_RETRY_DELAY: Duration = Duration::from_millis(200);

fn acquire_exclusive_file_lock(
    file: &fs::File,
    timeout: Duration,
    retry_delay: Duration,
) -> Result<Duration, String> {
    let lock_started = Instant::now();

    loop {
        match file.try_lock() {
            Ok(()) => return Ok(lock_started.elapsed()),
            Err(TryLockError::WouldBlock) => {
                let elapsed = lock_started.elapsed();
                if elapsed >= timeout {
                    eprintln!(
                        ">>> [UPLOAD][TIMING] build-cache-lock-timeout-ms={}",
                        duration_ms(elapsed)
                    );
                    return Err(format!(
                        "O cache de compilação está ocupado por outra instância do Bloquin há mais de {} segundos. Aguarde o outro envio terminar e tente novamente.",
                        timeout.as_secs()
                    ));
                }

                std::thread::sleep(retry_delay.min(timeout.saturating_sub(elapsed)));
            }
            Err(TryLockError::Error(error)) => {
                return Err(format!("Erro ao bloquear o cache de compilação: {}", error));
            }
        }
    }
}

struct BuildCacheLock {
    // O lock é liberado ao fechar o arquivo, inclusive quando o processo cai.
    // O prefixo evita um warning, mas o handle precisa permanecer vivo durante
    // compilação e upload.
    _file: fs::File,
}

impl BuildCacheLock {
    fn acquire(build_cache_dir: &Path) -> Result<Self, String> {
        let lock_path = build_cache_lock_path(build_cache_dir);
        let parent = lock_path
            .parent()
            .ok_or_else(|| "Não consegui preparar o lock do cache de compilação.".to_string())?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("Erro ao preparar o lock de compilação: {}", error))?;

        let file = fs::OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            // O arquivo guarda apenas o lock; nunca devemos alterar seu
            // conteúdo, especialmente enquanto outra instância o usa.
            .truncate(false)
            .open(&lock_path)
            .map_err(|error| format!("Erro ao abrir o lock de compilação: {}", error))?;

        println!(
            ">>> [UPLOAD] Aguardando acesso exclusivo ao cache: {:?}",
            build_cache_dir
        );
        let lock_wait = acquire_exclusive_file_lock(
            &file,
            BUILD_CACHE_LOCK_TIMEOUT,
            BUILD_CACHE_LOCK_RETRY_DELAY,
        )?;
        println!(
            ">>> [UPLOAD][TIMING] build-cache-lock-wait-ms={}",
            duration_ms(lock_wait)
        );

        Ok(Self { _file: file })
    }
}

// ─── Localiza ou baixa o arduino-cli ─────────────────────────────────────
fn find_or_download_cli() -> Result<String, String> {
    let exe_name = if cfg!(target_os = "windows") {
        "arduino-cli.exe"
    } else {
        "arduino-cli"
    };

    // 1. Binário empacotado junto com o instalador do Bloquin (caminho ideal)
    if let Ok(exe_path) = std::env::current_exe() {
        let bundled = exe_path
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .join("resources")
            .join(exe_name);
        if bundled.exists() && cli_is_usable(bundled.to_string_lossy().as_ref()) {
            println!(">>> [CLI] Usando binário empacotado: {:?}", bundled);
            return Ok(bundled.to_string_lossy().to_string());
        }
    }

    // 2. Variável de ambiente explícita
    if let Ok(path) = std::env::var("ARDUINO_CLI_PATH") {
        if std::path::Path::new(&path).exists() && cli_is_usable(&path) {
            println!(">>> [CLI] Usando ARDUINO_CLI_PATH={}", path);
            return Ok(path);
        }
    }

    // 3. No PATH do sistema
    if cli_is_usable("arduino-cli") {
        println!(">>> [CLI] arduino-cli encontrado no PATH do sistema.");
        return Ok("arduino-cli".to_string());
    }

    // 4. Cache de download anterior
    let temp_dir = env::temp_dir().join("bloquin_cli");
    let local_cli = temp_dir.join(exe_name);
    if local_cli.exists() && cli_is_usable(local_cli.to_string_lossy().as_ref()) {
        println!(">>> [CLI] arduino-cli em cache: {:?}", local_cli);
        return Ok(local_cli.to_string_lossy().to_string());
    }

    // 5. Plano B: download da internet
    println!(">>> [CLI] Iniciando PLANO B: Download do arduino-cli...");
    let _ = fs::create_dir_all(&temp_dir);

    let url = if cfg!(target_os = "windows") {
        "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip"
    } else if cfg!(target_os = "macos") {
        "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_macOS_64bit.tar.gz"
    } else {
        "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Linux_64bit.tar.gz"
    };

    let archive_name = if cfg!(target_os = "windows") {
        "cli.zip"
    } else {
        "cli.tar.gz"
    };
    let archive_path = temp_dir.join(archive_name);

    let curl_status = Command::new("curl")
        .hide_window()
        .args([
            "--fail",
            "--location",
            "--proto",
            "=https",
            "--tlsv1.2",
            "--connect-timeout",
            "10",
            "--max-time",
            "120",
            "--retry",
            "2",
            "--retry-delay",
            "1",
            url,
            "--output",
            archive_path.to_str().unwrap(),
        ])
        .status()
        .map_err(|e| format!("Erro ao executar curl: {}", e))?;
    if !curl_status.success() {
        return Err("Falha ao baixar o arduino-cli (verifique a internet).".to_string());
    }

    let tar_status = Command::new("tar")
        .hide_window()
        .args([
            "-xf",
            archive_path.to_str().unwrap(),
            "-C",
            temp_dir.to_str().unwrap(),
        ])
        .status()
        .map_err(|e| format!("Erro ao descompactar: {}", e))?;
    if !tar_status.success() {
        return Err("Falha ao descompactar o arduino-cli.".to_string());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(mut perms) = fs::metadata(&local_cli).map(|m| m.permissions()) {
            perms.set_mode(0o755);
            let _ = fs::set_permissions(&local_cli, perms);
        }
    }

    if local_cli.exists() {
        let _ = fs::remove_file(archive_path);
        println!(">>> [CLI] Download concluído: {:?}", local_cli);
        Ok(local_cli.to_string_lossy().to_string())
    } else {
        Err("arduino-cli não encontrado mesmo após a extração.".to_string())
    }
}

// ─── Garante que o core da placa está instalado na versão fixada ──────────
fn ensure_core_installed(cli_path: &str, placa: &str) -> Result<String, String> {
    let toolchain = board_toolchain(placa)?;
    let core_versioned = format!("{}@{}", toolchain.core, toolchain.version);

    println!(
        ">>> [CORE] Verificando '{}' v{}...",
        toolchain.core, toolchain.version
    );

    let list_output = Command::new(cli_path)
        .hide_window()
        .args(["core", "list"])
        .output()
        .map_err(|e| format!("Erro ao listar cores: {}", e))?;

    let list_str = String::from_utf8_lossy(&list_output.stdout);
    let versao_ok = list_str
        .lines()
        .any(|l| l.starts_with(toolchain.core) && l.contains(toolchain.version));

    if !versao_ok {
        println!(">>> [CORE] Instalando {}...", core_versioned);

        if toolchain.core == "esp32:esp32" {
            let _ = Command::new(cli_path)
                .hide_window()
                .args(["config", "init"])
                .output();
            let esp_url = "https://espressif.github.io/arduino-esp32/package_esp32_index.json";
            let add = Command::new(cli_path)
                .hide_window()
                .args(["config", "add", "board_manager.additional_urls", esp_url])
                .output()
                .map_err(|e| format!("Erro ao configurar URL ESP32: {}", e))?;
            if !add.status.success() {
                return Err(format!(
                    "Erro ao configurar URL ESP32: {}",
                    String::from_utf8_lossy(&add.stderr)
                ));
            }
        }

        let update = Command::new(cli_path)
            .hide_window()
            .args(["core", "update-index"])
            .output()
            .map_err(|e| format!("Erro no update-index: {}", e))?;
        if !update.status.success() {
            return Err("Falha ao atualizar índice de placas (sem internet?).".to_string());
        }

        let install = Command::new(cli_path)
            .hide_window()
            .args(["core", "install", &core_versioned])
            .output()
            .map_err(|e| format!("Erro ao instalar core: {}", e))?;
        if !install.status.success() {
            return Err(format!(
                "Falha ao instalar {}: {}",
                core_versioned,
                String::from_utf8_lossy(&install.stderr)
            ));
        }

        println!(">>> [CORE] '{}' instalado!", core_versioned);
    } else {
        println!(
            ">>> [CORE] Versão correta '{}' já instalada.",
            core_versioned
        );
    }

    Ok(toolchain.fqbn.to_string())
}

fn ensure_library_installed(cli_path: &str, library: &str, version: &str) -> Result<(), String> {
    let list = Command::new(cli_path)
        .hide_window()
        .args(["lib", "list"])
        .output()
        .map_err(|e| format!("Erro ao listar bibliotecas: {}", e))?;
    if !list.status.success() {
        return Err(format!(
            "Falha ao listar bibliotecas: {}",
            String::from_utf8_lossy(&list.stderr)
        ));
    }

    let installed = String::from_utf8_lossy(&list.stdout).lines().any(|line| {
        let mut columns = line.split_whitespace();
        columns.next() == Some(library) && columns.next() == Some(version)
    });
    if installed {
        println!(">>> [LIB] '{}@{}' já instalada.", library, version);
        return Ok(());
    }

    let update = Command::new(cli_path)
        .hide_window()
        .args(["lib", "update-index"])
        .output()
        .map_err(|e| format!("Erro ao atualizar o índice de bibliotecas: {}", e))?;
    if !update.status.success() {
        return Err(format!(
            "Falha ao atualizar bibliotecas: {}",
            String::from_utf8_lossy(&update.stderr)
        ));
    }

    let library_versioned = format!("{}@{}", library, version);
    let install = Command::new(cli_path)
        .hide_window()
        .args(["lib", "install", &library_versioned])
        .output()
        .map_err(|e| format!("Erro ao instalar a biblioteca {}: {}", library_versioned, e))?;
    if !install.status.success() {
        return Err(format!(
            "Falha ao instalar a biblioteca {}: {}",
            library_versioned,
            String::from_utf8_lossy(&install.stderr)
        ));
    }

    println!(">>> [LIB] '{}' instalada.", library_versioned);
    Ok(())
}

// ─── Setup inicial — chamado pelo frontend na abertura do app ─────────────
//
// Emite eventos "setup-progress" para o frontend mostrar uma tela
// amigável enquanto o arduino-cli e os cores são preparados.
// Após { step: "done" }, o App libera a interface normalmente.
// ─────────────────────────────────────────────────────────────────────────
#[tauri::command]
fn run_setup(window: tauri::Window, state: tauri::State<AppState>) {
    // Se já foi feito nesta sessão, confirma imediatamente
    if state.setup_done.load(Ordering::Relaxed) {
        let _ = window.emit(
            "setup-progress",
            SetupProgress {
                step: "done".into(),
                message: "Bloquin pronto!".into(),
                percent: 100,
            },
        );
        return;
    }

    if state.setup_running.swap(true, Ordering::AcqRel) {
        return;
    }

    let setup_done = Arc::clone(&state.setup_done);
    let setup_running = Arc::clone(&state.setup_running);
    let cli_path_mu = Arc::clone(&state.cli_path);
    let core_fqbns = Arc::clone(&state.core_fqbns);

    std::thread::spawn(move || {
        let _setup_guard = SetupRunGuard(setup_running);
        // ── Passo 1: Localizar/baixar o arduino-cli ───────────────────────
        let _ = window.emit(
            "setup-progress",
            SetupProgress {
                step: "cli".into(),
                message: "Procurando ferramentas de compilação...".into(),
                percent: 5,
            },
        );

        let cli = match find_or_download_cli() {
            Ok(c) => c,
            Err(e) => {
                let _ = window.emit("setup-progress", SetupProgress {
                    step: "error".into(),
                    message: format!(
                        "Não encontrei as ferramentas de compilação.\nVerifique a internet e abra o Bloquin novamente.\n\nDetalhe: {}",
                        e
                    ),
                    percent: 0,
                });
                return;
            }
        };

        *cli_path_mu.lock().unwrap() = cli.clone();

        // ── Passo 2: Core ESP32 ───────────────────────────────────────────
        let _ = window.emit("setup-progress", SetupProgress {
            step: "core".into(),
            message: "Verificando suporte ao ESP32...\nNa primeira vez isso pode levar alguns minutos — fique tranquilo! ☕".into(),
            percent: 20,
        });

        let esp32_fqbn = match ensure_core_installed(&cli, "esp32") {
            Ok(fqbn) => fqbn,
            Err(e) => {
                let _ = window.emit("setup-progress", SetupProgress {
                    step: "error".into(),
                    message: format!(
                        "Não consegui instalar o suporte ao ESP32.\nVerifique a internet e tente novamente.\n\nDetalhe: {}",
                        e
                    ),
                    percent: 0,
                });
                return;
            }
        };
        if let Err(error) = cache_fqbn(&core_fqbns, "esp32", esp32_fqbn) {
            eprintln!(">>> [CORE] Aviso ao guardar cache ESP32: {}", error);
        }

        // ── Passo 3: Core Arduino AVR (Uno/Nano) ──────────────────────────
        let _ = window.emit(
            "setup-progress",
            SetupProgress {
                step: "core".into(),
                message: "Quase lá! Verificando suporte ao Arduino Uno/Nano...".into(),
                percent: 70,
            },
        );

        let uno_fqbn = match ensure_core_installed(&cli, "uno") {
            Ok(fqbn) => fqbn,
            Err(e) => {
                let _ = window.emit("setup-progress", SetupProgress {
                    step: "error".into(),
                    message: format!(
                        "Não consegui instalar o suporte ao Arduino.\nVerifique a internet e tente novamente.\n\nDetalhe: {}",
                        e
                    ),
                    percent: 0,
                });
                return;
            }
        };
        if let Err(error) = cache_fqbn(&core_fqbns, "uno", uno_fqbn) {
            eprintln!(">>> [CORE] Aviso ao guardar cache Uno: {}", error);
        }
        match board_toolchain("nano") {
            Ok(nano) => {
                if let Err(error) = cache_fqbn(&core_fqbns, "nano", nano.fqbn.to_string()) {
                    eprintln!(">>> [CORE] Aviso ao guardar cache Nano: {}", error);
                }
            }
            Err(error) => eprintln!(">>> [CORE] Aviso ao preparar FQBN Nano: {}", error),
        }

        // ── Passo 4: Bibliotecas usadas pelos blocos de servo ─────────────
        let _ = window.emit(
            "setup-progress",
            SetupProgress {
                step: "core".into(),
                message: "Preparando os blocos de servo motor...".into(),
                percent: 88,
            },
        );

        for (library, version) in [("Servo", "1.3.0"), ("ESP32Servo", "3.0.9")] {
            if let Err(e) = ensure_library_installed(&cli, library, version) {
                eprintln!(
                    ">>> [LIB] Aviso: suporte opcional '{}@{}' indisponível: {}",
                    library, version, e
                );
                let _ = window.emit(
                    "setup-progress",
                    SetupProgress {
                        step: "core".into(),
                        message: format!(
                            "O Bloquin continuará sem bloquear. Os blocos de servo podem precisar de internet depois.\n\nDetalhe: {}",
                            e,
                        ),
                        percent: 92,
                    },
                );
            }
        }

        // ── Concluído ─────────────────────────────────────────────────────
        setup_done.store(true, Ordering::Relaxed);

        let _ = window.emit(
            "setup-progress",
            SetupProgress {
                step: "done".into(),
                message: "Tudo pronto! Bora programar! 🚀".into(),
                percent: 100,
            },
        );

        println!(">>> [SETUP] Concluído. cli={}", cli);
    });
}

// ─── Pipeline de compilação + upload ─────────────────────────────────────
fn temporary_sketch_paths(process_id: u32) -> (PathBuf, PathBuf) {
    let sketch_stem = format!("bloquin_sketch_{}", process_id);
    let sketch_dir = env::temp_dir().join(&sketch_stem);
    let sketch_path = sketch_dir.join(format!("{}.ino", sketch_stem));
    (sketch_dir, sketch_path)
}

struct TemporarySketchDir(Option<PathBuf>);

impl TemporarySketchDir {
    fn new(path: PathBuf) -> Self {
        Self(Some(path))
    }

    fn cleanup(&mut self) -> Result<(), String> {
        let Some(path) = self.0.take() else {
            return Ok(());
        };

        match fs::remove_dir_all(&path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!(
                "Não consegui limpar o sketch temporário: {}",
                error
            )),
        }
    }
}

impl Drop for TemporarySketchDir {
    fn drop(&mut self) {
        if let Err(error) = self.cleanup() {
            eprintln!(">>> [UPLOAD] {}", error);
        }
    }
}

fn resolve_fqbn_for_upload(
    cli: &str,
    placa: &str,
    core_fqbns: &Mutex<HashMap<String, String>>,
) -> Result<String, String> {
    if let Some(fqbn) = cached_fqbn(core_fqbns, placa)? {
        println!(">>> [CORE] Usando FQBN em cache para {}: {}", placa, fqbn);
        return Ok(fqbn);
    }

    // O caminho normal é preenchido pelo setup. Este fallback só roda se o
    // estado não tiver sido preenchido, preservando a recuperação segura sem
    // pagar `arduino-cli core list` a cada envio.
    println!(
        ">>> [CORE] Cache ausente para {}; verificando toolchain...",
        placa
    );
    let fqbn = ensure_core_installed(cli, placa)?;
    cache_fqbn(core_fqbns, placa, fqbn.clone())?;
    Ok(fqbn)
}

fn run_upload_pipeline(
    codigo: &str,
    placa: &str,
    porta: &str,
    cli: &str,
    core_fqbns: &Mutex<HashMap<String, String>>,
    build_cache_root: &Path,
    window: &tauri::Window,
) -> Result<(), String> {
    println!(">>> [UPLOAD] Iniciando pipeline...");
    let pipeline_started = Instant::now();
    // O arduino-cli exige que o arquivo principal tenha o mesmo nome da
    // pasta. O sketch continua descartável; somente o build cache é
    // persistido por placa/versão na área de cache do aplicativo.
    let (sketch_dir, sketch_path) = temporary_sketch_paths(std::process::id());
    let mut sketch_cleanup = TemporarySketchDir::new(sketch_dir.clone());

    let result = (|| {
        let fqbn = run_timed_upload_stage(window, pipeline_started, "checking-core", || {
            resolve_fqbn_for_upload(cli, placa, core_fqbns)
        })?;

        let (build_cache_dir, _build_cache_lock) =
            run_timed_upload_stage(window, pipeline_started, "preparing", || {
                let build_cache_dir = build_cache_directory(build_cache_root, placa)?;
                // O lock interprocesso preserva o cache compartilhado, sem
                // permitir que outro Bloquin sobrescreva os binários entre a
                // compilação e o upload desta execução.
                let build_cache_lock = BuildCacheLock::acquire(&build_cache_dir)?;
                fs::create_dir_all(&sketch_dir)
                    .map_err(|e| format!("Erro ao preparar o sketch: {}", e))?;
                fs::create_dir_all(&build_cache_dir)
                    .map_err(|e| format!("Erro ao preparar o cache de compilação: {}", e))?;
                fs::write(&sketch_path, codigo)
                    .map_err(|e| format!("Erro ao criar arquivo: {}", e))?;
                Ok((build_cache_dir, build_cache_lock))
            })?;

        run_timed_upload_stage(window, pipeline_started, "compiling", || {
            println!(">>> [UPLOAD] Compilando com FQBN: {}", fqbn);
            let compile = Command::new(cli)
                .hide_window()
                .arg("compile")
                .arg("-b")
                .arg(&fqbn)
                .arg("--build-path")
                .arg(&build_cache_dir)
                .arg(&sketch_dir)
                .output()
                .map_err(|e| format!("Erro no processo de compilação: {}", e))?;

            if !compile.status.success() {
                return Err(format!(
                    "Erro no código (Compilação falhou):\n{}",
                    String::from_utf8_lossy(&compile.stderr)
                ));
            }
            Ok(())
        })?;

        run_timed_upload_stage(window, pipeline_started, "sending", || {
            println!(">>> [UPLOAD] Enviando para {}...", porta);
            let upload = Command::new(cli)
                .hide_window()
                .arg("upload")
                .arg("-b")
                .arg(&fqbn)
                .arg("-p")
                .arg(porta)
                // `upload` não recompila. Informar explicitamente os binários
                // produzidos acima evita procurar um diretório temporário novo.
                .arg("--input-dir")
                .arg(&build_cache_dir)
                .output()
                .map_err(|e| format!("Erro no upload: {}", e))?;

            if !upload.status.success() {
                return Err(format!(
                    "Erro ao gravar na porta {}:\n{}",
                    porta,
                    String::from_utf8_lossy(&upload.stderr)
                ));
            }
            Ok(())
        })?;

        Ok(())
    })();

    // A limpeza não pode transformar um upload já concluído em falha, mas
    // precisa ser medida e registrada para revelar problemas de disco/antivírus
    // que antes ficavam invisíveis no Drop do diretório temporário.
    if let Err(error) = run_timed_upload_stage(window, pipeline_started, "cleaning", || {
        sketch_cleanup.cleanup()
    }) {
        eprintln!(">>> [UPLOAD] {}", error);
    }

    match &result {
        Ok(()) => println!(
            ">>> [UPLOAD][TIMING] pipeline=completed total_ms={}",
            duration_ms(pipeline_started.elapsed())
        ),
        Err(error) => eprintln!(
            ">>> [UPLOAD][TIMING] pipeline=failed total_ms={} error={}",
            duration_ms(pipeline_started.elapsed()),
            error
        ),
    }
    result
}

#[cfg(test)]
mod tests {
    use super::{
        acquire_exclusive_file_lock, board_toolchain, build_cache_directory, build_cache_lock_path,
        cache_fqbn, cached_fqbn, temporary_sketch_paths, BuildCacheLock,
    };
    use std::collections::HashMap;
    use std::fs::{self, OpenOptions};
    use std::path::Path;
    use std::sync::Mutex;
    use std::time::Duration;

    #[test]
    fn temporary_sketch_file_matches_directory_name() {
        let (sketch_dir, sketch_path) = temporary_sketch_paths(6421);

        assert_eq!(sketch_dir.file_name(), sketch_path.file_stem());
        assert_eq!(
            sketch_path.extension().and_then(|ext| ext.to_str()),
            Some("ino")
        );
    }

    #[test]
    fn build_cache_is_stable_and_isolated_by_board_and_toolchain() {
        let root = Path::new("/cache-do-bloquin");
        let uno = build_cache_directory(root, "uno").expect("cache Uno");
        let nano = build_cache_directory(root, "nano").expect("cache Nano");
        let esp32 = build_cache_directory(root, "esp32").expect("cache ESP32");

        assert_eq!(uno, root.join("uno-arduino-avr-1-8-7"));
        assert_eq!(nano, root.join("nano-arduino-avr-1-8-7"));
        assert_eq!(esp32, root.join("esp32-esp32-esp32-3-3-7"));
        assert_ne!(uno, nano);
        assert_ne!(nano, esp32);
    }

    #[test]
    fn build_cache_lock_is_shared_only_by_the_matching_board_cache() {
        let root = Path::new("/cache-do-bloquin");
        let uno = build_cache_directory(root, "uno").expect("cache Uno");
        let nano = build_cache_directory(root, "nano").expect("cache Nano");

        assert_eq!(
            build_cache_lock_path(&uno),
            root.join("uno-arduino-avr-1-8-7.lock")
        );
        assert_ne!(build_cache_lock_path(&uno), build_cache_lock_path(&nano));
    }

    #[test]
    fn build_cache_lock_times_out_and_can_be_reacquired_after_release() {
        let test_root =
            std::env::temp_dir().join(format!("bloquin-build-lock-test-{}", std::process::id()));
        let build_cache_dir = test_root.join("uno");
        let lock = BuildCacheLock::acquire(&build_cache_dir).expect("first lock");
        let lock_path = build_cache_lock_path(&build_cache_dir);
        let contender = OpenOptions::new()
            .read(true)
            .write(true)
            .open(&lock_path)
            .expect("second lock handle");

        let timeout_error = acquire_exclusive_file_lock(&contender, Duration::ZERO, Duration::ZERO)
            .expect_err("a held lock must not wait indefinitely");
        assert!(timeout_error.contains("ocupado"));

        drop(lock);
        acquire_exclusive_file_lock(&contender, Duration::ZERO, Duration::ZERO)
            .expect("lock released with first handle");
        contender.unlock().expect("unlock contender");
        drop(contender);
        fs::remove_dir_all(&test_root).expect("remove test lock directory");
    }

    #[test]
    fn fqbn_cache_returns_the_setup_verified_board_without_rechecking_cli() {
        let cache = Mutex::new(HashMap::new());
        cache_fqbn(&cache, "uno", "arduino:avr:uno".to_string()).expect("cache Uno");

        assert_eq!(
            cached_fqbn(&cache, "uno").expect("read cache"),
            Some("arduino:avr:uno".to_string())
        );
        assert_eq!(cached_fqbn(&cache, "esp32").expect("read cache"), None);
    }

    #[test]
    fn board_toolchain_rejects_unsupported_boards() {
        assert!(board_toolchain("placa-inexistente").is_err());
    }
}

#[tauri::command]
fn upload_code(
    codigo: String,
    placa: String,
    porta: String,
    window: tauri::Window,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    use tauri::Manager;

    if porta.trim().is_empty() {
        return Err("Selecione uma porta USB antes de enviar o código.".to_string());
    }
    if codigo.len() > 2 * 1024 * 1024 {
        return Err("O código excede o limite seguro de 2 MB.".to_string());
    }
    if !matches!(placa.as_str(), "uno" | "nano" | "esp32") {
        return Err("Placa não suportada pelo Bloquin.".to_string());
    }

    // Barreira de segurança — impede compilação antes do setup terminar
    if !state.setup_done.load(Ordering::Relaxed) {
        let _ = window.emit(
            "upload-result",
            "err:O Bloquin ainda está sendo preparado. Aguarde a tela inicial terminar e tente novamente.",
        );
        return Ok("aguardando_setup".to_string());
    }

    let build_cache_root = window
        .app_handle()
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Não consegui localizar o cache de compilação: {}", error))?
        .join("arduino-build");
    let cli = state
        .cli_path
        .lock()
        .map_err(|_| "Não consegui acessar as ferramentas de compilação.".to_string())?
        .clone();
    let is_uploading = Arc::clone(&state.is_uploading);
    let core_fqbns = Arc::clone(&state.core_fqbns);
    if is_uploading
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Relaxed)
        .is_err()
    {
        return Err("Já existe um envio em andamento. Aguarde a conclusão.".to_string());
    }
    state.is_reading_serial.store(false, Ordering::Relaxed);
    state.serial_generation.fetch_add(1, Ordering::AcqRel);

    let window_clone = window.clone();

    std::thread::spawn(move || {
        let result = run_upload_pipeline(
            &codigo,
            &placa,
            &porta,
            &cli,
            &core_fqbns,
            &build_cache_root,
            &window_clone,
        );
        is_uploading.store(false, Ordering::Release);
        match result {
            Ok(_) => {
                let _ = window_clone.emit("upload-result", "ok");
            }
            Err(e) => {
                let _ = window_clone.emit("upload-result", format!("err:{}", e));
            }
        }
    });

    Ok("iniciando".to_string())
}

#[tauri::command]
fn start_serial(
    porta: String,
    window: tauri::Window,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    if porta.trim().is_empty() {
        return Err("Selecione uma porta USB antes de abrir o monitor serial.".to_string());
    }
    state.is_reading_serial.store(false, Ordering::Relaxed);
    let serial_generation = Arc::clone(&state.serial_generation);
    let generation = serial_generation.fetch_add(1, Ordering::AcqRel) + 1;

    let is_reading = Arc::clone(&state.is_reading_serial);
    is_reading.store(true, Ordering::Relaxed);

    std::thread::spawn(move || {
        let mut port = match serialport::new(&porta, 115200)
            .timeout(Duration::from_millis(100))
            .open()
        {
            Ok(p) => p,
            Err(_) => {
                is_reading.store(false, Ordering::Release);
                let _ = window.emit(
                    "serial-error",
                    format!("Não foi possível abrir a porta {}", porta),
                );
                return;
            }
        };

        let _ = window.emit("serial-ready", ());

        let mut serial_buf: Vec<u8> = vec![0; 1000];
        let mut string_acumulada = String::new();

        while is_reading.load(Ordering::Relaxed)
            && serial_generation.load(Ordering::Acquire) == generation
        {
            match port.read(serial_buf.as_mut_slice()) {
                Ok(t) if t > 0 => {
                    let pedaco: String = serial_buf[..t]
                        .iter()
                        .filter(|&&b| b == b'\n' || b == b'\r' || (0x20..0x7F).contains(&b))
                        .map(|&b| b as char)
                        .collect();

                    string_acumulada.push_str(&pedaco);

                    if string_acumulada.len() > 4000
                        || (string_acumulada.len() > 300 && !string_acumulada.contains('\n'))
                    {
                        string_acumulada.clear();
                    }

                    while let Some(pos) = string_acumulada.find('\n') {
                        let frase = string_acumulada[..pos].trim_end().to_string();
                        string_acumulada = string_acumulada[pos + 1..].to_string();
                        if !frase.is_empty() {
                            let _ = window.emit("serial-message", frase);
                            std::thread::sleep(Duration::from_millis(20));
                        }
                    }
                }
                _ => {
                    std::thread::sleep(Duration::from_millis(10));
                }
            }
        }
    });

    Ok("Monitor iniciado".to_string())
}

#[tauri::command]
fn stop_serial(state: tauri::State<AppState>) -> Result<String, String> {
    state.is_reading_serial.store(false, Ordering::Relaxed);
    state.serial_generation.fetch_add(1, Ordering::AcqRel);
    Ok("Monitor parado".to_string())
}

#[tauri::command]
fn get_available_ports() -> Result<Vec<String>, String> {
    match serialport::available_ports() {
        Ok(ports) => {
            let mut port_names: Vec<String> = ports
                .into_iter()
                .filter(|p| matches!(p.port_type, serialport::SerialPortType::UsbPort(_)))
                .map(|p| p.port_name)
                .collect();
            port_names.sort();
            Ok(port_names)
        }
        Err(e) => Err(format!("Erro ao buscar portas USB: {}", e)),
    }
}

// ─── SAG no workspace ──────────────────────────────────────────────────────
// O SAG é carregado em um WebView filho da janela principal, não em iframe.
// Assim ele continua sendo o documento de topo de sua própria origem: cookies
// `SameSite=Strict` pertencem somente ao SAG e nenhuma credencial do Bloquin é
// enviada ou compartilhada.
const SAG_WEBVIEW_LABEL: &str = "sag-embedded";
const SAG_LOGIN_URL: &str = "https://sagsite.vercel.app/login?next=%2F";

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SagBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl SagBounds {
    fn is_valid(&self) -> bool {
        self.x.is_finite()
            && self.y.is_finite()
            && self.width.is_finite()
            && self.height.is_finite()
            && self.width >= 1.0
            && self.height >= 1.0
    }
}

#[derive(serde::Serialize, Clone)]
struct SagPageLoad {
    state: String,
}

fn is_allowed_sag_navigation(url: &tauri::Url) -> bool {
    // A allowlist é deliberadamente pequena: o conteúdo incorporado não pode
    // navegar para uma origem arbitrária nem abrir uma segunda janela.
    url.scheme() == "https"
        && matches!(url.host_str(), Some("sagsite.vercel.app"))
        && url.port_or_known_default() == Some(443)
}

fn ensure_main_webview(caller: &tauri::Webview) -> Result<(), String> {
    if caller.label() == "main" && caller.window().label() == "main" {
        return Ok(());
    }
    Err("Esta ação só pode ser iniciada pelo Bloquin.".to_string())
}

#[cfg(target_os = "linux")]
fn ensure_sag_child_webview_supported() -> Result<(), String> {
    // No runtime Wry usado pelo Tauri 2.11, `Window::add_child` no Linux é
    // inserido em um GtkBox e ignora os bounds do host React. Exibi-lo assim
    // dividiria a janela em vez de virar uma aba. Não abrimos navegador como
    // fallback: a integração aguarda suporte a bounds/GtkFixed no upstream.
    Err("O SAG incorporado ainda não é suportado na versão Linux do Bloquin. A aba funciona no Windows; no Linux ela aguarda suporte nativo a WebViews posicionados.".to_string())
}

#[cfg(not(target_os = "linux"))]
fn ensure_sag_child_webview_supported() -> Result<(), String> {
    Ok(())
}

fn position_sag_webview(webview: &tauri::Webview, bounds: &SagBounds) -> Result<(), String> {
    webview
        .set_position(LogicalPosition::new(bounds.x, bounds.y))
        .map_err(|error| format!("Não consegui posicionar o SAG: {error}"))?;
    webview
        .set_size(LogicalSize::new(bounds.width, bounds.height))
        .map_err(|error| format!("Não consegui redimensionar o SAG: {error}"))
}

#[tauri::command]
async fn open_sag(
    caller: tauri::Webview,
    app: tauri::AppHandle,
    bounds: SagBounds,
    gate: tauri::State<'_, SagWebviewGate>,
) -> Result<(), String> {
    ensure_main_webview(&caller)?;
    ensure_sag_child_webview_supported()?;
    let _gate = gate
        .0
        .lock()
        .map_err(|_| "Não consegui preparar a aba do SAG.".to_string())?;
    if !bounds.is_valid() {
        return Err("A área do SAG ainda não está pronta para ser exibida.".to_string());
    }

    if let Some(webview) = app.get_webview(SAG_WEBVIEW_LABEL) {
        position_sag_webview(&webview, &bounds)?;
        webview
            .show()
            .map_err(|error| format!("Não consegui mostrar o SAG: {error}"))?;
        return Ok(());
    }

    let window = caller.window();
    let page_events = app.clone();
    let sag_url = SAG_LOGIN_URL
        .parse()
        .map_err(|error| format!("A URL do SAG é inválida: {error}"))?;

    // `open_sag` é async por exigência do WebView2: criar o child webview em
    // um comando síncrono pode causar deadlock no Windows.
    let builder = WebviewBuilder::new(SAG_WEBVIEW_LABEL, WebviewUrl::External(sag_url))
        .on_navigation(is_allowed_sag_navigation)
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_download(|_, _| false)
        .on_page_load(move |_, payload| {
            let state = match payload.event() {
                PageLoadEvent::Started => "loading",
                PageLoadEvent::Finished => "ready",
            };
            let _ = page_events.emit_to(
                "main",
                "sag-page-load",
                SagPageLoad {
                    state: state.to_string(),
                },
            );
        });

    let webview = window
        .add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width, bounds.height),
        )
        .map_err(|error| format!("Não consegui iniciar o SAG dentro do Bloquin: {error}"))?;
    webview
        .set_auto_resize(false)
        .map_err(|error| format!("Não consegui preparar o tamanho do SAG: {error}"))?;
    webview
        .show()
        .map_err(|error| format!("Não consegui mostrar o SAG: {error}"))?;
    webview
        .set_focus()
        .map_err(|error| format!("Não consegui focar o SAG: {error}"))?;
    Ok(())
}

#[tauri::command]
fn hide_sag(
    caller: tauri::Webview,
    app: tauri::AppHandle,
    gate: tauri::State<'_, SagWebviewGate>,
) -> Result<(), String> {
    ensure_main_webview(&caller)?;
    let _gate = gate
        .0
        .lock()
        .map_err(|_| "Não consegui atualizar a aba do SAG.".to_string())?;
    if let Some(webview) = app.get_webview(SAG_WEBVIEW_LABEL) {
        webview
            .hide()
            .map_err(|error| format!("Não consegui ocultar o SAG: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
fn reload_sag(
    caller: tauri::Webview,
    app: tauri::AppHandle,
    gate: tauri::State<'_, SagWebviewGate>,
) -> Result<(), String> {
    ensure_main_webview(&caller)?;
    let _gate = gate
        .0
        .lock()
        .map_err(|_| "Não consegui atualizar a aba do SAG.".to_string())?;
    let webview = app
        .get_webview(SAG_WEBVIEW_LABEL)
        .ok_or_else(|| "O SAG ainda não foi aberto.".to_string())?;
    webview
        .reload()
        .map_err(|error| format!("Não consegui recarregar o SAG: {error}"))
}

#[tauri::command]
fn dispose_sag(
    caller: tauri::Webview,
    app: tauri::AppHandle,
    gate: tauri::State<'_, SagWebviewGate>,
) -> Result<(), String> {
    ensure_main_webview(&caller)?;
    let _gate = gate
        .0
        .lock()
        .map_err(|_| "Não consegui fechar a aba do SAG.".to_string())?;
    if let Some(webview) = app.get_webview(SAG_WEBVIEW_LABEL) {
        webview
            .close()
            .map_err(|error| format!("Não consegui fechar o SAG: {error}"))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// No AppImage empacotado (Mesa/EGL de ~2022, vindo do runner ubuntu-22.04 do
/// CI), a plataforma EGL-Wayland nativa falha ao inicializar em compositores
/// mais novos que já não expõem o protocolo legado `wl_drm` que esse Mesa
/// antigo usa para negociar o GBM (visto no Hyprland: `Could not create
/// default EGL display: EGL_BAD_PARAMETER. Aborting...`, processo morre antes
/// de abrir qualquer janela). Forçar o GTK a rodar via XWayland em vez do
/// backend Wayland nativo contorna esse caminho quebrado — é a mesma técnica
/// usada por outros apps GTK/Electron para evitar esse tipo de instabilidade
/// entre versões de Mesa e protocolos de compositor. Só define a variável se
/// o usuário não tiver escolhido um backend explicitamente.
#[cfg(target_os = "linux")]
fn force_x11_backend_for_wayland_egl_compat() {
    if env::var_os("GDK_BACKEND").is_none() {
        // SAFETY: chamado no início de `run()`, antes de qualquer thread
        // adicional ser criada e antes do GTK/WebKit lerem o ambiente.
        unsafe {
            env::set_var("GDK_BACKEND", "x11");
        }
    }
}

pub fn run() {
    #[cfg(target_os = "linux")]
    force_x11_backend_for_wayland_egl_compat();

    let app_state = AppState {
        is_reading_serial: Arc::new(AtomicBool::new(false)),
        serial_generation: Arc::new(AtomicU64::new(0)),
        is_uploading: Arc::new(AtomicBool::new(false)),
        setup_done: Arc::new(AtomicBool::new(false)),
        setup_running: Arc::new(AtomicBool::new(false)),
        cli_path: Arc::new(Mutex::new(String::new())),
        core_fqbns: Arc::new(Mutex::new(HashMap::new())),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .manage(SagWebviewGate(Mutex::new(())))
        .invoke_handler(tauri::generate_handler![
            run_setup,
            upload_code,
            start_serial,
            stop_serial,
            get_available_ports,
            open_sag,
            hide_sag,
            reload_sag,
            dispose_sag,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
