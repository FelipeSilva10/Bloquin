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

// ── Localiza o arduino-cli com três fallbacks ─────────────────────────────────
//
//  1. Recurso bundlado dentro do instalador  (.../resources/arduino-cli.exe)
//  2. Cache local do usuário                 (%LOCALAPPDATA%\OficinaCode\arduino-cli.exe)
//  3. PATH do sistema                        (where arduino-cli)
//
fn find_arduino_cli(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {

    // ── Fallback 1: bundlado ────────────────────────────────────────────────
    if let Ok(res_dir) = app_handle.path().resource_dir() {
        let bundled = res_dir.join("arduino-cli.exe");
        if bundled.exists() {
            println!(">>> [CLI] Encontrado bundlado: {:?}", bundled);
            return Some(bundled);
        }
    }

    // ── Fallback 2: cache local ─────────────────────────────────────────────
    #[cfg(target_os = "windows")]
    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        let cached = std::path::Path::new(&local_app_data)
            .join("OficinaCode")
            .join("arduino-cli.exe");
        if cached.exists() {
            println!(">>> [CLI] Encontrado em cache local: {:?}", cached);
            return Some(cached);
        }
    }

    // ── Fallback 3: PATH do sistema ─────────────────────────────────────────
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("where").arg("arduino-cli").output() {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout);
                let first_line = path_str.lines().next().unwrap_or("").trim().to_string();
                if !first_line.is_empty() {
                    let path = std::path::PathBuf::from(&first_line);
                    if path.exists() {
                        println!(">>> [CLI] Encontrado no PATH: {:?}", path);
                        return Some(path);
                    }
                }
            }
        }
    }

    // Linux / ChromeOS (Crostini)
    #[cfg(not(target_os = "windows"))]
    {
        // Cache local em ~/.local/share/OficinaCode/
        if let Ok(home) = env::var("HOME") {
            let cached = std::path::Path::new(&home)
                .join(".local")
                .join("share")
                .join("OficinaCode")
                .join("arduino-cli");
            if cached.exists() {
                println!(">>> [CLI] Encontrado em cache local (Linux): {:?}", cached);
                return Some(cached);
            }
        }

        // PATH via `which`
        if let Ok(output) = Command::new("which").arg("arduino-cli").output() {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout);
                let first_line = path_str.lines().next().unwrap_or("").trim().to_string();
                if !first_line.is_empty() {
                    let path = std::path::PathBuf::from(&first_line);
                    if path.exists() {
                        println!(">>> [CLI] Encontrado no PATH (Linux): {:?}", path);
                        return Some(path);
                    }
                }
            }
        }
    }

    println!(">>> [CLI] arduino-cli NÃO encontrado em nenhum dos fallbacks!");
    None
}

// ── Verifica se o arduino-cli está disponível ────────────────────────────────
#[tauri::command]
fn check_arduino_cli(app_handle: tauri::AppHandle) -> bool {
    find_arduino_cli(&app_handle).is_some()
}

// ── Setup: baixa e instala o arduino-cli + cores necessárias ─────────────────
#[tauri::command]
async fn setup_arduino_cli(
    window: tauri::Window,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {

    // Se já tiver, não faz nada
    if find_arduino_cli(&app_handle).is_some() {
        let _ = window.emit("setup-progress", "arduino-cli já está instalado!");
        return Ok("já instalado".to_string());
    }

    let _ = window.emit("setup-progress", "Baixando o arduino-cli...");

    // Determina onde salvar
    #[cfg(target_os = "windows")]
    let dest_dir = {
        let local = env::var("LOCALAPPDATA")
            .map_err(|_| "LOCALAPPDATA não encontrado".to_string())?;
        std::path::Path::new(&local).join("OficinaCode")
    };

    #[cfg(not(target_os = "windows"))]
    let dest_dir = {
        let home = env::var("HOME")
            .map_err(|_| "HOME não encontrado".to_string())?;
        std::path::Path::new(&home)
            .join(".local").join("share").join("OficinaCode")
    };

    fs::create_dir_all(&dest_dir)
        .map_err(|e| format!("Erro ao criar pasta: {}", e))?;

    // URLs por plataforma
    #[cfg(target_os = "windows")]
    let url = "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip";
    #[cfg(target_os = "linux")]
    let url = "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Linux_64bit.tar.gz";

    let zip_path = dest_dir.join("arduino-cli.zip");

    // Download via PowerShell / curl
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("powershell")
            .args(["-Command",
                &format!("Invoke-WebRequest -Uri '{}' -OutFile '{}'",
                    url, zip_path.display())])
            .status()
            .map_err(|e| format!("Erro no download: {}", e))?;
        if !status.success() {
            return Err("Falha ao baixar o arduino-cli".to_string());
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = Command::new("curl")
            .args(["-L", "-o", zip_path.to_str().unwrap(), url])
            .status()
            .map_err(|e| format!("Erro no download: {}", e))?;
        if !status.success() {
            return Err("Falha ao baixar o arduino-cli".to_string());
        }
    }

    let _ = window.emit("setup-progress", "Extraindo o arduino-cli...");

    // Extração
    #[cfg(target_os = "windows")]
    {
        let dest_str = dest_dir.display().to_string();
        let zip_str  = zip_path.display().to_string();
        let status = Command::new("powershell")
            .args(["-Command",
                &format!("Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                    zip_str, dest_str)])
            .status()
            .map_err(|e| format!("Erro na extração: {}", e))?;
        if !status.success() {
            return Err("Falha ao extrair o arduino-cli".to_string());
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = Command::new("tar")
            .args(["-xzf", zip_path.to_str().unwrap(), "-C", dest_dir.to_str().unwrap()])
            .status()
            .map_err(|e| format!("Erro na extração: {}", e))?;
        if !status.success() {
            return Err("Falha ao extrair o arduino-cli".to_string());
        }
        // Garante permissão de execução no Linux
        let cli_path = dest_dir.join("arduino-cli");
        let _ = Command::new("chmod").args(["+x", cli_path.to_str().unwrap()]).status();
    }

    let _ = fs::remove_file(&zip_path);

    // Verifica se o executável existe agora
    let cli = find_arduino_cli(&app_handle)
        .ok_or("arduino-cli não encontrado após extração".to_string())?;

    let _ = window.emit("setup-progress", "Atualizando índice de placas...");

    // Atualiza índice
    let _ = Command::new(&cli).arg("core").arg("update-index").status();

    let _ = window.emit("setup-progress", "Instalando suporte ao Arduino AVR...");

    // Instala core AVR
    let _ = Command::new(&cli)
        .args(["core", "install", "arduino:avr"])
        .status();

    let _ = window.emit("setup-progress", "Pronto! Arduino-cli instalado com sucesso.");

    Ok("instalado".to_string())
}

// ── Upload de código ──────────────────────────────────────────────────────────
#[tauri::command]
fn upload_code(
    codigo: String,
    placa: String,
    porta: String,
    state: tauri::State<AppState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {

    println!(">>> [1] Iniciando processo de envio...");

    // Para o serial antes de qualquer coisa
    state.is_reading_serial.store(false, Ordering::Relaxed);
    std::thread::sleep(Duration::from_millis(500));

    let fqbn = match placa.as_str() {
        "uno"   => "arduino:avr:uno",
        "nano"  => "arduino:avr:nano",
        "esp32" => "esp32:esp32:esp32",
        _       => "arduino:avr:uno",
    };

    let cli = find_arduino_cli(&app_handle)
        .ok_or("Erro compilador: arduino-cli não encontrado. Configure o ambiente primeiro.".to_string())?;

    let temp_dir   = env::temp_dir();
    let sketch_dir = temp_dir.join("oficina_code_sketch");
    let sketch_path = sketch_dir.join("oficina_code_sketch.ino");

    println!(">>> [4] Criando pasta temporária...");
    let _ = fs::create_dir_all(&sketch_dir);

    println!(">>> [5] Salvando código...");
    fs::write(&sketch_path, &codigo)
        .map_err(|e| format!("Erro ao criar arquivo: {}", e))?;

    println!(">>> [6] Compilando com: {:?}", cli);
    let compile_output = Command::new(&cli)
        .arg("compile")
        .arg("-b").arg(fqbn)
        .arg(&sketch_dir)
        .output()
        .map_err(|e| format!("Erro compilador: {}", e))?;

    if !compile_output.status.success() {
        let erro = String::from_utf8_lossy(&compile_output.stderr);
        return Err(format!("Erro no código:\n{}", erro));
    }

    println!(">>> [8] Enviando para a porta {}...", porta);
    let upload_output = Command::new(&cli)
        .arg("upload")
        .arg("-b").arg(fqbn)
        .arg("-p").arg(&porta)
        .arg(&sketch_dir)
        .output()
        .map_err(|e| format!("Erro upload: {}", e))?;

    if !upload_output.status.success() {
        let erro = String::from_utf8_lossy(&upload_output.stderr);
        return Err(format!("Erro na porta {}:\n{}", porta, erro));
    }

    println!(">>> [9] UPLOAD CONCLUÍDO COM SUCESSO!");
    Ok("Sucesso!".to_string())
}

// ── Monitor serial ────────────────────────────────────────────────────────────
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
                let _ = window.emit("serial-error",
                    format!("Não foi possível abrir a porta {}", porta));
                return;
            }
        };

        let mut serial_buf: Vec<u8> = vec![0; 1000];
        let mut string_acumulada = String::new();

        while is_reading.load(Ordering::Relaxed) {
            match port.read(serial_buf.as_mut_slice()) {
                Ok(t) if t > 0 => {
                    let pedaco = String::from_utf8_lossy(&serial_buf[..t]);
                    string_acumulada.push_str(&pedaco);

                    if string_acumulada.len() > 4000 {
                        string_acumulada.clear();
                    }

                    while let Some(pos) = string_acumulada.find('\n') {
                        let frase = string_acumulada[..pos].trim_end().to_string();
                        string_acumulada = string_acumulada[pos + 1..].to_string();
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