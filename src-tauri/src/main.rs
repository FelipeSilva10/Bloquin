#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::process::Command;
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager};
use std::time::Duration;

// ── Windows: oculta janelas CMD que surgiriam ao chamar processos externos ──
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ─────────────────────────────────────────────────────────────────────────────

struct AppState {
    is_reading_serial: Arc<AtomicBool>,
}

// ── Auxiliar: cria um Command já com CREATE_NO_WINDOW no Windows ─────────────

fn build_command(program: &std::path::Path) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new(program);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new(program)
    }
}

// ── Auxiliar: executa PowerShell sem janela visível (Windows) ────────────────

#[cfg(target_os = "windows")]
fn powershell_hidden(ps_command: &str) -> std::io::Result<std::process::Output> {
    Command::new("powershell")
        .args([
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            ps_command,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
}

// ── Download do arduino-cli para %LOCALAPPDATA%\OficinaCode\ ─────────────────
// Implementação real apenas no Windows; stub para outras plataformas.

#[cfg(target_os = "windows")]
fn run_cli_download(
    zip_path: &std::path::Path,
    target_dir: &std::path::Path,
    target_exe: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
    // 1. Download do ZIP
    let dl_cmd = format!(
        "Invoke-WebRequest -Uri \
'https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip' \
-OutFile '{}'",
        zip_path.display()
    );
    let out = powershell_hidden(&dl_cmd)
        .map_err(|e| format!("Erro ao iniciar download: {}", e))?;
    if !out.status.success() {
        return Err(format!(
            "Falha no download:\n{}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }

    // 2. Extração
    let ex_cmd = format!(
        "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
        zip_path.display(),
        target_dir.display()
    );
    let out = powershell_hidden(&ex_cmd)
        .map_err(|e| format!("Erro ao iniciar extração: {}", e))?;
    if !out.status.success() {
        return Err(format!(
            "Falha na extração:\n{}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }

    // 3. Remove o ZIP temporário
    let _ = fs::remove_file(zip_path);

    if target_exe.exists() {
        Ok(target_exe.to_path_buf())
    } else {
        Err("arduino-cli.exe não encontrado após a extração.".to_string())
    }
}

#[cfg(not(target_os = "windows"))]
fn run_cli_download(
    _zip_path: &std::path::Path,
    _target_dir: &std::path::Path,
    _target_exe: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
    Err("Download automático do arduino-cli disponível apenas no Windows.".to_string())
}

/// Baixa o arduino-cli para %LOCALAPPDATA%\OficinaCode\ (pasta normalizada).
/// Se já estiver presente não faz nada.
fn download_cli_to_appdata() -> Result<std::path::PathBuf, String> {
    let local_app_data = env::var("LOCALAPPDATA")
        .map_err(|_| "Variável LOCALAPPDATA não encontrada.".to_string())?;

    // Pasta sempre nomeada "OficinaCode" (evita a duplicação "Oficina Code")
    let target_dir = std::path::PathBuf::from(&local_app_data).join("OficinaCode");
    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Erro ao criar pasta de destino: {}", e))?;

    let target_exe = target_dir.join("arduino-cli.exe");
    if target_exe.exists() {
        return Ok(target_exe);
    }

    let zip_path = target_dir.join("arduino-cli.zip");
    run_cli_download(&zip_path, &target_dir, &target_exe)
}

// ── Resolução do caminho do arduino-cli ──────────────────────────────────────
//
// Prioridade:
//   1. resources/ (embutido no instalador — preferencial)
//   2. %LOCALAPPDATA%\OficinaCode\   (versão baixada anteriormente)
//   3. Download automático para %LOCALAPPDATA%\OficinaCode\

fn arduino_cli_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    #[cfg(target_os = "windows")]
    let exe_name = "arduino-cli.exe";
    #[cfg(not(target_os = "windows"))]
    let exe_name = "arduino-cli";

    // 1. Bundled em resources/
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let bundled = resource_dir.join(exe_name);
        if bundled.exists() {
            println!(">>> arduino-cli encontrado em resources/: {:?}", bundled);
            return Ok(bundled);
        }
    }

    // 2. Já baixado em AppData\OficinaCode\
    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        let cached = std::path::PathBuf::from(&local_app_data)
            .join("OficinaCode")
            .join(exe_name);
        if cached.exists() {
            println!(">>> arduino-cli encontrado em AppData: {:?}", cached);
            return Ok(cached);
        }
    }

    // 3. Baixar agora (fallback de rede)
    println!(">>> arduino-cli não encontrado localmente — iniciando download...");
    download_cli_to_appdata()
}

// ── Comandos Tauri ────────────────────────────────────────────────────────────

#[tauri::command]
fn upload_code(
    codigo: String,
    placa: String,
    porta: String,
    state: tauri::State<AppState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    println!(">>> [1] Iniciando processo de envio...");

    // Para o monitor serial para liberar a porta
    println!(">>> [2] Liberando a porta serial...");
    state.is_reading_serial.store(false, Ordering::Relaxed);
    std::thread::sleep(Duration::from_millis(500));

    let fqbn = match placa.as_str() {
        "uno"   => "arduino:avr:uno",
        "nano"  => "arduino:avr:nano",
        "esp32" => "esp32:esp32:esp32",
        _       => "arduino:avr:uno",
    };

    // Resolve o caminho do CLI (com fallback de download)
    let cli = arduino_cli_path(&app_handle)?;

    // Cria sketch temporário
    let temp_dir    = env::temp_dir();
    let sketch_dir  = temp_dir.join("oficina_code_sketch");
    let sketch_path = sketch_dir.join("oficina_code_sketch.ino");

    println!(">>> [4] Criando pasta temporária: {:?}", sketch_dir);
    fs::create_dir_all(&sketch_dir)
        .map_err(|e| format!("Erro ao criar pasta temporária: {}", e))?;

    println!(">>> [5] Salvando código...");
    fs::write(&sketch_path, &codigo)
        .map_err(|e| format!("Erro ao criar arquivo de sketch: {}", e))?;

    // Compila — sem janela CMD
    println!(">>> [6] Compilando com: {:?}", cli);
    let compile_output = {
        let mut cmd = build_command(&cli);
        cmd.arg("compile")
            .arg("-b").arg(fqbn)
            .arg(&sketch_dir)
            .output()
            .map_err(|e| format!("Erro ao iniciar compilador: {}", e))?
    };

    if !compile_output.status.success() {
        let erro = String::from_utf8_lossy(&compile_output.stderr);
        return Err(format!("Erro no código:\n{}", erro));
    }

    // Envia — sem janela CMD
    println!(">>> [8] Enviando para a porta {}...", porta);
    let upload_output = {
        let mut cmd = build_command(&cli);
        cmd.arg("upload")
            .arg("-b").arg(fqbn)
            .arg("-p").arg(&porta)
            .arg(&sketch_dir)
            .output()
            .map_err(|e| format!("Erro ao iniciar upload: {}", e))?
    };

    if !upload_output.status.success() {
        let erro = String::from_utf8_lossy(&upload_output.stderr);
        return Err(format!("Erro na porta {}:\n{}", porta, erro));
    }

    println!(">>> [9] UPLOAD CONCLUÍDO COM SUCESSO!");
    Ok("Sucesso!".to_string())
}

#[tauri::command]
fn start_serial(
    porta: String,
    window: tauri::Window,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    // Para qualquer leitura anterior
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
        Err(e) => Err(format!("Erro ao listar portas USB: {}", e)),
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}