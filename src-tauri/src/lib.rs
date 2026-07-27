use std::env;
use std::fs;
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;

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

struct AppState {
    is_reading_serial: Arc<AtomicBool>,
    // Cada início/parada cria uma geração. Isso impede que uma thread serial
    // antiga continue lendo caso outra seja iniciada antes de ela encerrar.
    serial_generation: Arc<AtomicU64>,
    is_uploading: Arc<AtomicBool>,
    setup_done: Arc<AtomicBool>,
    setup_running: Arc<AtomicBool>,
    cli_path: Arc<Mutex<String>>,
}

struct SetupRunGuard(Arc<AtomicBool>);

impl Drop for SetupRunGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Relaxed);
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
    let (core, fqbn, version) = match placa {
        "uno" => ("arduino:avr", "arduino:avr:uno", "1.8.7"),
        "nano" => ("arduino:avr", "arduino:avr:nano", "1.8.7"),
        "esp32" => ("esp32:esp32", "esp32:esp32:esp32", "3.3.7"),
        _ => ("arduino:avr", "arduino:avr:uno", "1.8.7"),
    };
    let core_versioned = format!("{}@{}", core, version);

    println!(">>> [CORE] Verificando '{}' v{}...", core, version);

    let list_output = Command::new(cli_path)
        .hide_window()
        .args(["core", "list"])
        .output()
        .map_err(|e| format!("Erro ao listar cores: {}", e))?;

    let list_str = String::from_utf8_lossy(&list_output.stdout);
    let versao_ok = list_str
        .lines()
        .any(|l| l.starts_with(core) && l.contains(version));

    if !versao_ok {
        println!(">>> [CORE] Instalando {}...", core_versioned);

        if core == "esp32:esp32" {
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

    Ok(fqbn.to_string())
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

        if let Err(e) = ensure_core_installed(&cli, "esp32") {
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

        // ── Passo 3: Core Arduino AVR (Uno/Nano) ──────────────────────────
        let _ = window.emit(
            "setup-progress",
            SetupProgress {
                step: "core".into(),
                message: "Quase lá! Verificando suporte ao Arduino Uno/Nano...".into(),
                percent: 70,
            },
        );

        if let Err(e) = ensure_core_installed(&cli, "uno") {
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
fn temporary_sketch_paths(process_id: u32) -> (std::path::PathBuf, std::path::PathBuf) {
    let sketch_stem = format!("bloquin_sketch_{}", process_id);
    let sketch_dir = env::temp_dir().join(&sketch_stem);
    let sketch_path = sketch_dir.join(format!("{}.ino", sketch_stem));
    (sketch_dir, sketch_path)
}

struct TemporarySketchDir(std::path::PathBuf);

impl Drop for TemporarySketchDir {
    fn drop(&mut self) {
        if let Err(error) = fs::remove_dir_all(&self.0) {
            if error.kind() != std::io::ErrorKind::NotFound {
                eprintln!(">>> [UPLOAD] Não consegui limpar o sketch temporário: {}", error);
            }
        }
    }
}

fn run_upload_pipeline(codigo: &str, placa: &str, porta: &str, cli: &str) -> Result<(), String> {
    println!(">>> [UPLOAD] Iniciando pipeline...");

    // ensure_core_installed é rápido aqui — versão já instalada pelo setup
    let fqbn = ensure_core_installed(cli, placa)?;

    // O arduino-cli exige que o arquivo principal tenha o mesmo nome da pasta.
    let (sketch_dir, sketch_path) = temporary_sketch_paths(std::process::id());
    let _sketch_cleanup = TemporarySketchDir(sketch_dir.clone());

    fs::create_dir_all(&sketch_dir).map_err(|e| format!("Erro ao preparar o sketch: {}", e))?;
    fs::write(&sketch_path, codigo).map_err(|e| format!("Erro ao criar arquivo: {}", e))?;

    println!(">>> [UPLOAD] Compilando com FQBN: {}", fqbn);
    let compile = Command::new(cli)
        .hide_window()
        .args(["compile", "-b", &fqbn, sketch_dir.to_str().unwrap()])
        .output()
        .map_err(|e| format!("Erro no processo de compilação: {}", e))?;

    if !compile.status.success() {
        return Err(format!(
            "Erro no código (Compilação falhou):\n{}",
            String::from_utf8_lossy(&compile.stderr)
        ));
    }

    println!(">>> [UPLOAD] Enviando para {}...", porta);
    let upload = Command::new(cli)
        .hide_window()
        .args([
            "upload",
            "-b",
            &fqbn,
            "-p",
            porta,
            sketch_dir.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Erro no upload: {}", e))?;

    if !upload.status.success() {
        return Err(format!(
            "Erro ao gravar na porta {}:\n{}",
            porta,
            String::from_utf8_lossy(&upload.stderr)
        ));
    }

    println!(">>> [UPLOAD] CONCLUÍDO COM SUCESSO!");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::temporary_sketch_paths;

    #[test]
    fn temporary_sketch_file_matches_directory_name() {
        let (sketch_dir, sketch_path) = temporary_sketch_paths(6421);

        assert_eq!(sketch_dir.file_name(), sketch_path.file_stem());
        assert_eq!(
            sketch_path.extension().and_then(|ext| ext.to_str()),
            Some("ino")
        );
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

    let cli = state.cli_path.lock().unwrap().clone();
    let is_uploading = Arc::clone(&state.is_uploading);
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
        let result = run_upload_pipeline(&codigo, &placa, &porta, &cli);
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

#[tauri::command]
async fn open_admin_panel(
    app: tauri::AppHandle,
    access_token: String,
    refresh_token: String,
) -> Result<String, String> {
    use tauri::Manager;

    if let Some(window) = app.get_webview_window("admin-panel") {
        window
            .set_focus()
            .map_err(|e| format!("Erro ao focar a janela: {}", e))?;
        return Ok("ok".to_string());
    }

    let at_json = serde_json::to_string(&access_token)
        .map_err(|_| "Erro ao serializar access_token".to_string())?;
    let rt_json = serde_json::to_string(&refresh_token)
        .map_err(|_| "Erro ao serializar refresh_token".to_string())?;

    let init_script = format!(
        "(function(){{Object.defineProperty(window,'__bloquin_auth',{{value:{{access_token:{},refresh_token:{}}},writable:false,configurable:false,enumerable:false}});}})();",
        at_json, rt_json
    );

    let webview_url = tauri::WebviewUrl::External(
        "https://sagsite.vercel.app/login?next=%2F"
            .parse()
            .map_err(|e| format!("URL inválida: {}", e))?,
    );

    tauri::WebviewWindowBuilder::new(&app, "admin-panel", webview_url)
        .title("Admin — Painel de Gestão")
        .inner_size(1280.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .center()
        .focused(true)
        .initialization_script(&init_script)
        .build()
        .map_err(|e| format!("Erro ao abrir janela: {}", e))?;

    Ok("ok".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        is_reading_serial: Arc::new(AtomicBool::new(false)),
        serial_generation: Arc::new(AtomicU64::new(0)),
        is_uploading: Arc::new(AtomicBool::new(false)),
        setup_done: Arc::new(AtomicBool::new(false)),
        setup_running: Arc::new(AtomicBool::new(false)),
        cli_path: Arc::new(Mutex::new(String::new())),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            run_setup,
            upload_code,
            start_serial,
            stop_serial,
            get_available_ports,
            open_admin_panel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
