#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::process::Command;
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter; 
use std::time::Duration;

struct AppState {
    is_reading_serial: Arc<AtomicBool>,
}

#[tauri::command]
fn upload_code(codigo: String, placa: String, porta: String, state: tauri::State<AppState>) -> Result<String, String> {
    println!(">>> [1] Iniciando processo de envio...");
    println!(">>> [2] Desligando o monitor serial (liberando a porta)...");
    state.is_reading_serial.store(false, Ordering::Relaxed);
    std::thread::sleep(Duration::from_millis(500)); 

    let fqbn = match placa.as_str() {
        "uno" => "arduino:avr:uno",
        "nano" => "arduino:avr:nano",
        "esp32" => "esp32:esp32:esp32",
        _ => "arduino:avr:uno",
    };
    
    let temp_dir = env::temp_dir();
    let sketch_dir = temp_dir.join("oficina_code_sketch");
    let sketch_path = sketch_dir.join("oficina_code_sketch.ino");

    println!(">>> [4] Criando pasta temporária...");
    let _ = fs::create_dir_all(&sketch_dir);

    println!(">>> [5] Salvando o código C++ gerado...");
    if let Err(e) = fs::write(&sketch_path, codigo) {
        return Err(format!("Erro ao criar arquivo: {}", e));
    }

    println!(">>> [6] Compilando...");
    let compile_output = match Command::new("arduino-cli").arg("compile").arg("-b").arg(fqbn).arg(&sketch_dir).output() { 
        Ok(out) => out, 
        Err(e) => return Err(format!("Erro compilador: {}", e)) 
    };

    if !compile_output.status.success() {
        let erro_compilacao = String::from_utf8_lossy(&compile_output.stderr);
        return Err(format!("Erro no código:\n{}", erro_compilacao));
    }
    
    println!(">>> [8] Enviando para a porta {}...", porta);
    let upload_output = match Command::new("arduino-cli").arg("upload").arg("-b").arg(fqbn).arg("-p").arg(&porta).arg(&sketch_dir).output() { 
        Ok(out) => out, 
        Err(e) => return Err(format!("Erro upload: {}", e)) 
    };

    if !upload_output.status.success() {
        let erro_upload = String::from_utf8_lossy(&upload_output.stderr);
        return Err(format!("Erro na Porta {}:\n{}", porta, erro_upload));
    }

    println!(">>> [9] UPLOAD CONCLUÍDO COM SUCESSO!");
    Ok("Sucesso!".to_string())
}

// --- COMANDO 2: LIGAR O MONITOR SERIAL (COM ANTI-SPAM) ---
#[tauri::command]
fn start_serial(porta: String, window: tauri::Window, state: tauri::State<AppState>) -> Result<String, String> {
    state.is_reading_serial.store(false, Ordering::Relaxed);
    std::thread::sleep(Duration::from_millis(200));

    let is_reading = Arc::clone(&state.is_reading_serial);
    is_reading.store(true, Ordering::Relaxed);

    std::thread::spawn(move || {
        let mut port = match serialport::new(&porta, 9600).timeout(Duration::from_millis(100)).open() {
            Ok(p) => p,
            Err(_) => {
                let _ = window.emit("serial-error", format!("Não foi possível abrir a porta {}", porta));
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
                        string_acumulada = string_acumulada[pos+1..].to_string();
                        
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
            let mut port_names: Vec<String> = ports.into_iter()
                .filter(|p| matches!(p.port_type, serialport::SerialPortType::UsbPort(_)))
                .map(|p| p.port_name)
                .collect();
            port_names.sort();
            Ok(port_names)
        },
        Err(e) => Err(format!("Erro ao buscar portas USB: {}", e))
    }
}

fn main() {
    let app_state = AppState {
        is_reading_serial: Arc::new(AtomicBool::new(false)),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init()) 
        .manage(app_state) 
        .invoke_handler(tauri::generate_handler![upload_code, start_serial, stop_serial, get_available_ports])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}