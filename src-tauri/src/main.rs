#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::process::Command;
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager};
use std::time::Duration;

struct AppState {
    is_reading_serial: Arc<AtomicBool>,
}

// ─── Localização do arduino-cli: 3 fallbacks ──────────────────────────────────
//
//  1. Bundled no instalador  → resource_dir/arduino-cli.exe
//  2. Cache local do usuário → %LOCALAPPDATA%\OficinaCode\arduino-cli.exe
//  3. No PATH do sistema     → onde o sistema tiver instalado
//
fn find_arduino_cli(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    // Fallback 1 — bundled com o instalador
    if let Ok(res_dir) = app_handle.path().resource_dir() {
        let p = res_dir.join("arduino-cli.exe");
        if p.exists() {
            println!("[arduino-cli] Encontrado (bundled): {:?}", p);
            return Some(p);
        }
        // Às vezes o Tauri coloca em subpasta _up_
        let p2 = res_dir.parent().unwrap_or(&res_dir).join("arduino-cli.exe");
        if p2.exists() {
            println!("[arduino-cli] Encontrado (bundled parent): {:?}", p2);
            return Some(p2);
        }
    }

    // Fallback 2 — cache local (download anterior)
    if let Some(p) = arduino_cli_cache_path() {
        if p.exists() {
            println!("[arduino-cli] Encontrado (cache local): {:?}", p);
            return Some(p);
        }
    }

    // Fallback 3 — no PATH do sistema (instalação manual)
    if let Ok(out) = Command::new("where").arg("arduino-cli").output() {
        if out.status.success() {
            let raw = String::from_utf8_lossy(&out.stdout);
            if let Some(first) = raw.lines().next() {
                let p = std::path::PathBuf::from(first.trim());
                if p.exists() {
                    println!("[arduino-cli] Encontrado (PATH): {:?}", p);
                    return Some(p);
                }
            }
        }
    }

    println!("[arduino-cli] NÃO encontrado em nenhum local.");
    None
}

/// Caminho canônico do cache local do usuário
fn arduino_cli_cache_path() -> Option<std::path::PathBuf> {
    env::var("LOCALAPPDATA")
        .ok()
        .map(|d| std::path::PathBuf::from(d).join("OficinaCode").join("arduino-cli.exe"))
}

/// Diretório raiz do cache local
fn arduino_cli_cache_dir() -> Option<std::path::PathBuf> {
    arduino_cli_cache_path().and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

// ─── Comando: checa se arduino-cli está disponível ───────────────────────────

#[tauri::command]
fn check_arduino_cli(app_handle: tauri::AppHandle) -> bool {
    find_arduino_cli(&app_handle).is_some()
}

// ─── Comando: baixa e configura o arduino-cli do zero ────────────────────────

#[tauri::command]
async fn setup_arduino_cli(
    app_handle: tauri::AppHandle,
    window: tauri::Window,
) -> Result<String, String> {
    // Se já existe, não faz nada
    if let Some(p) = find_arduino_cli(&app_handle) {
        return Ok(format!("arduino-cli já está disponível em: {}", p.display()));
    }

    let cache_dir = arduino_cli_cache_dir()
        .ok_or("Não foi possível determinar o diretório de instalação.")?;

    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Erro ao criar diretório de instalação: {}", e))?;

    let zip_path = cache_dir.join("arduino-cli.zip");
    let cli_path = cache_dir.join("arduino-cli.exe");
    let url = "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip";

    // ── Etapa 1: download ──────────────────────────────────────────────────
    let _ = window.emit("arduino-setup-progress", serde_json::json!({
        "etapa": 1,
        "total": 4,
        "msg": "Baixando arduino-cli... (pode demorar alguns minutos)"
    }));

    let dl = Command::new("powershell")
        .args([
            "-NoProfile", "-NonInteractive", "-Command",
            &format!(
                "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; \
                 Invoke-WebRequest -Uri '{}' -OutFile '{}'",
                url,
                zip_path.display()
            ),
        ])
        .output()
        .map_err(|e| format!("Erro ao iniciar PowerShell para download: {}", e))?;

    if !dl.status.success() {
        return Err(format!(
            "Falha no download do arduino-cli:\n{}",
            String::from_utf8_lossy(&dl.stderr)
        ));
    }

    // ── Etapa 2: extrair zip ───────────────────────────────────────────────
    let _ = window.emit("arduino-setup-progress", serde_json::json!({
        "etapa": 2,
        "total": 4,
        "msg": "Extraindo arquivos..."
    }));

    let extract = Command::new("powershell")
        .args([
            "-NoProfile", "-NonInteractive", "-Command",
            &format!(
                "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                zip_path.display(),
                cache_dir.display()
            ),
        ])
        .output()
        .map_err(|e| format!("Erro ao iniciar extração: {}", e))?;

    if !extract.status.success() {
        return Err(format!(
            "Falha ao extrair arduino-cli:\n{}",
            String::from_utf8_lossy(&extract.stderr)
        ));
    }

    let _ = fs::remove_file(&zip_path);

    if !cli_path.exists() {
        return Err(
            "arduino-cli.exe não encontrado após extração. \
             O arquivo ZIP pode ter uma estrutura diferente do esperado."
                .to_string(),
        );
    }

    // ── Etapa 3: atualizar índice de plataformas ───────────────────────────
    let _ = window.emit("arduino-setup-progress", serde_json::json!({
        "etapa": 3,
        "total": 4,
        "msg": "Atualizando índice de placas Arduino..."
    }));

    // Adiciona URL do ESP32 ao config antes de atualizar
    let _ = Command::new(&cli_path)
        .args([
            "config", "add", "board_manager.additional_urls",
            "https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json",
        ])
        .output();

    let _ = Command::new(&cli_path)
        .args(["core", "update-index"])
        .output();

    // ── Etapa 4: instalar core AVR (Uno/Nano) ─────────────────────────────
    let _ = window.emit("arduino-setup-progress", serde_json::json!({
        "etapa": 4,
        "total": 4,
        "msg": "Instalando suporte para Arduino Uno/Nano (AVR)... pode demorar alguns minutos"
    }));

    let avr = Command::new(&cli_path)
        .args(["core", "install", "arduino:avr"])
        .output();

    if let Ok(out) = avr {
        if !out.status.success() {
            println!("[setup] Aviso: falha ao instalar arduino:avr — {:?}", out.stderr);
        }
    }

    let _ = window.emit("arduino-setup-progress", serde_json::json!({
        "etapa": 4,
        "total": 4,
        "msg": "Concluído! arduino-cli está pronto para uso."
    }));

    Ok(format!("arduino-cli instalado em: {}", cli_path.display()))
}

// ─── Comando: instala um core específico se ainda não tiver ──────────────────

fn ensure_core_installed(cli: &std::path::PathBuf, fqbn: &str) -> Result<(), String> {
    // Extrai a plataforma do fqbn: "arduino:avr:uno" → "arduino:avr"
    let platform = fqbn.splitn(3, ':').take(2).collect::<Vec<_>>().join(":");

    let check = Command::new(cli)
        .args(["core", "list"])
        .output()
        .map_err(|e| format!("Erro ao listar cores: {}", e))?;

    let installed = String::from_utf8_lossy(&check.stdout);
    if installed.contains(&platform) {
        return Ok(()); // Já instalado
    }

    println!("[core] Instalando plataforma: {}", platform);

    // Para ESP32, garante que a URL extra está configurada
    if platform.starts_with("esp32") {
        let _ = Command::new(cli)
            .args([
                "config", "add", "board_manager.additional_urls",
                "https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json",
            ])
            .output();
        let _ = Command::new(cli).args(["core", "update-index"]).output();
    }

    let install = Command::new(cli)
        .args(["core", "install", &platform])
        .output()
        .map_err(|e| format!("Erro ao instalar core {}: {}", platform, e))?;

    if !install.status.success() {
        let err = String::from_utf8_lossy(&install.stderr);
        return Err(format!(
            "Falha ao instalar suporte para a placa ({}):\n{}",
            platform, err
        ));
    }

    Ok(())
}

// ─── Comando: upload de código ────────────────────────────────────────────────

#[tauri::command]
fn upload_code(
    codigo: String,
    placa: String,
    porta: String,
    state: tauri::State<AppState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    println!(">>> [1] Iniciando processo de envio...");

    // Para o monitor serial antes de ocupar a porta
    println!(">>> [2] Liberando a porta serial...");
    state.is_reading_serial.store(false, Ordering::Relaxed);
    std::thread::sleep(Duration::from_millis(500));

    let fqbn = match placa.as_str() {
        "uno"   => "arduino:avr:uno",
        "nano"  => "arduino:avr:nano",
        "esp32" => "esp32:esp32:esp32",
        _       => "arduino:avr:uno",
    };

    // ── Localiza o arduino-cli com todos os fallbacks ──────────────────────
    let cli = find_arduino_cli(&app_handle).ok_or_else(|| {
        "❌ arduino-cli não encontrado!\n\
         Feche a IDE, vá ao painel principal e clique em\n\
         '⚙️ Configurar arduino-cli' para instalar automaticamente."
            .to_string()
    })?;

    println!(">>> [3] Usando arduino-cli em: {:?}", cli);

    // ── Garante que o core da placa está instalado ─────────────────────────
    println!(">>> [4] Verificando suporte à placa ({})...", fqbn);
    if let Err(e) = ensure_core_installed(&cli, fqbn) {
        return Err(format!(
            "❌ Problema ao preparar suporte à placa:\n{}\n\n\
             Dica: verifique a sua conexão com a internet e tente novamente.",
            e
        ));
    }

    // ── Cria pasta temporária com o sketch ────────────────────────────────
    let temp_dir    = env::temp_dir();
    let sketch_dir  = temp_dir.join("oficina_code_sketch");
    let sketch_path = sketch_dir.join("oficina_code_sketch.ino");

    println!(">>> [5] Criando sketch temporário em: {:?}", sketch_path);
    let _ = fs::create_dir_all(&sketch_dir);
    fs::write(&sketch_path, &codigo)
        .map_err(|e| format!("Erro ao salvar o código: {}", e))?;

    // ── Compilação ─────────────────────────────────────────────────────────
    println!(">>> [6] Compilando para {}...", fqbn);
    let compile = Command::new(&cli)
        .arg("compile")
        .arg("-b").arg(fqbn)
        .arg(&sketch_dir)
        .output()
        .map_err(|e| format!("Erro ao executar o compilador: {}", e))?;

    if !compile.status.success() {
        let erro = String::from_utf8_lossy(&compile.stderr);
        return Err(format!("❌ Erro no código:\n{}", erro));
    }

    // ── Upload ─────────────────────────────────────────────────────────────
    println!(">>> [7] Enviando para {} na porta {}...", fqbn, porta);
    let upload = Command::new(&cli)
        .arg("upload")
        .arg("-b").arg(fqbn)
        .arg("-p").arg(&porta)
        .arg(&sketch_dir)
        .output()
        .map_err(|e| format!("Erro ao executar o upload: {}", e))?;

    if !upload.status.success() {
        let erro = String::from_utf8_lossy(&upload.stderr);
        return Err(format!("❌ Erro ao enviar para a porta {}:\n{}", porta, erro));
    }

    println!(">>> [8] UPLOAD CONCLUÍDO COM SUCESSO!");
    Ok("Sucesso!".to_string())
}

// ─── Monitor Serial ───────────────────────────────────────────────────────────

#[tauri::command]
fn start_serial(
    porta: String,
    window: tauri::Window,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    state.is_reading_serial.store(false, Ordering::Relaxed);
    std::thread::sleep(Duration::from_millis(200));

    let is_reading = Arc::clone(&state.is_reading_serial);
    is_reading.store(true, Ordering::Relaxed);

    std::thread::spawn(move || {
        let mut port = match serialport::new(&porta, 9600)
            .timeout(Duration::from_millis(100))
            .open()
        {
            Ok(p)  => p,
            Err(_) => {
                let _ = window.emit(
                    "serial-error",
                    format!("Não foi possível abrir a porta {}", porta),
                );
                return;
            }
        };

        let mut serial_buf: Vec<u8> = vec![0; 1000];
        let mut acumulado = String::new();

        while is_reading.load(Ordering::Relaxed) {
            match port.read(serial_buf.as_mut_slice()) {
                Ok(t) if t > 0 => {
                    acumulado.push_str(&String::from_utf8_lossy(&serial_buf[..t]));
                    if acumulado.len() > 4000 {
                        acumulado.clear();
                    }
                    while let Some(pos) = acumulado.find('\n') {
                        let frase = acumulado[..pos].trim_end().to_string();
                        acumulado = acumulado[pos + 1..].to_string();
                        let _ = window.emit("serial-message", frase);
                        std::thread::sleep(Duration::from_millis(20));
                    }
                }
                _ => std::thread::sleep(Duration::from_millis(10)),
            }
        }
    });

    Ok("Monitor iniciado".to_string())
}

#[tauri::command]
fn stop_serial(state: tauri::State<AppState>) -> Result<String, String> {
    state.is_reading_serial.store(false, Ordering::Relaxed);
    Ok("Monitor parado".to_string())
}

#[tauri::command]
fn get_available_ports() -> Result<Vec<String>, String> {
    match serialport::available_ports() {
        Ok(ports) => {
            let mut names: Vec<String> = ports
                .into_iter()
                .filter(|p| matches!(p.port_type, serialport::SerialPortType::UsbPort(_)))
                .map(|p| p.port_name)
                .collect();
            names.sort();
            Ok(names)
        }
        Err(e) => Err(format!("Erro ao buscar portas USB: {}", e)),
    }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

fn main() {
    let app_state = AppState {
        is_reading_serial: Arc::new(AtomicBool::new(false)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            upload_code,
            start_serial,
            stop_serial,
            get_available_ports,
            check_arduino_cli,
            setup_arduino_cli,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}