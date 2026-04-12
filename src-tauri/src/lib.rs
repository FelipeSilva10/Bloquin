use std::fs;
use std::process::Command;
use std::env;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use std::time::Duration;

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

struct AppState {
    is_reading_serial: Arc<AtomicBool>,
}

fn find_or_download_cli() -> Result<String, String> {
    let exe_name = if cfg!(target_os = "windows") { "arduino-cli.exe" } else { "arduino-cli" };

    if let Ok(exe_path) = std::env::current_exe() {
        let bundled = exe_path
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .join("resources")
            .join(exe_name);

        if bundled.exists() {
            println!(">>> [CLI] Usando binário empacotado: {:?}", bundled);
            return Ok(bundled.to_string_lossy().to_string());
        }
    }

    if let Ok(path) = std::env::var("ARDUINO_CLI_PATH") {
        if std::path::Path::new(&path).exists() {
            println!(">>> [CLI] Usando ARDUINO_CLI_PATH={}", path);
            return Ok(path);
        }
    }

    if Command::new("arduino-cli")
        .hide_window()
        .arg("version")
        .output()
        .is_ok()
    {
        println!(">>> [CLI] arduino-cli encontrado no PATH do sistema.");
        return Ok("arduino-cli".to_string());
    }

    let temp_dir  = env::temp_dir().join("bloquin_cli");
    let local_cli = temp_dir.join(exe_name);

    if local_cli.exists() {
        println!(">>> [CLI] arduino-cli encontrado em cache: {:?}", local_cli);
        return Ok(local_cli.to_string_lossy().to_string());
    }

    println!(">>> [CLI] Iniciando PLANO B: Download do arduino-cli...");
    let _ = fs::create_dir_all(&temp_dir);

    let url = if cfg!(target_os = "windows") {
        "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip"
    } else if cfg!(target_os = "macos") {
        "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_macOS_64bit.tar.gz"
    } else {
        "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Linux_64bit.tar.gz"
    };

    let archive_name = if cfg!(target_os = "windows") { "cli.zip" } else { "cli.tar.gz" };
    let archive_path = temp_dir.join(archive_name);

    println!(">>> [CLI] Baixando de {} ...", url);
    let curl_status = Command::new("curl")
        .hide_window()
        .args(["-L", url, "-o", archive_path.to_str().unwrap()])
        .status()
        .map_err(|e| format!("Erro ao executar curl (download): {}", e))?;

    if !curl_status.success() {
        return Err("Falha ao baixar o arquivo do arduino-cli.".to_string());
    }

    let tar_status = Command::new("tar")
        .hide_window()
        .args(["-xf", archive_path.to_str().unwrap(), "-C", temp_dir.to_str().unwrap()])
        .status()
        .map_err(|e| format!("Erro ao executar tar (extração): {}", e))?;

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
        Err("arduino-cli não foi encontrado mesmo após a extração.".to_string())
    }
}

fn ensure_core_installed(cli_path: &str, placa: &str) -> Result<String, String> {
    let (core, fqbn) = match placa {
        "uno"   => ("arduino:avr", "arduino:avr:uno"),
        "nano"  => ("arduino:avr", "arduino:avr:nano"),
        "esp32" => ("esp32:esp32", "esp32:esp32:esp32"),
        _       => ("arduino:avr", "arduino:avr:uno"),
    };

    println!(">>> [CORE] Verificando pacote '{}'...", core);
    let list_output = Command::new(cli_path)
        .hide_window()
        .arg("core")
        .arg("list")
        .output()
        .map_err(|e| format!("Erro ao listar cores: {}", e))?;

    let list_str = String::from_utf8_lossy(&list_output.stdout);

    if !list_str.contains(core) {
        println!(">>> [CORE] Pacote '{}' não encontrado. Instalando...", core);

        if core == "esp32:esp32" {
            let _ = Command::new(cli_path)
                .hide_window()
                .args(["config", "init"])
                .output();

            let esp_url = "https://espressif.github.io/arduino-esp32/package_esp32_index.json";
            let add_url = Command::new(cli_path)
                .hide_window()
                .args(["config", "add", "board_manager.additional_urls", esp_url])
                .output()
                .map_err(|e| format!("Erro na injeção da URL do ESP32: {}", e))?;

            if !add_url.status.success() {
                let err = String::from_utf8_lossy(&add_url.stderr);
                return Err(format!("Erro ao configurar URL do ESP32 no YAML: {}", err));
            }
        }

        let update = Command::new(cli_path)
            .hide_window()
            .args(["core", "update-index"])
            .output()
            .map_err(|e| format!("Erro no update-index: {}", e))?;

        if !update.status.success() {
            return Err("Falha ao atualizar o index das placas (sem internet?).".to_string());
        }

        let install = Command::new(cli_path)
            .hide_window()
            .args(["core", "install", core])
            .output()
            .map_err(|e| format!("Erro ao instalar core: {}", e))?;

        if !install.status.success() {
            let err = String::from_utf8_lossy(&install.stderr);
            return Err(format!("Erro fatal ao instalar pacote {}:\n{}", core, err));
        }

        println!(">>> [CORE] Core '{}' instalado com sucesso!", core);
    } else {
        println!(">>> [CORE] Pacote '{}' já instalado.", core);
    }

    Ok(fqbn.to_string())
}

fn run_upload_pipeline(codigo: &str, placa: &str, porta: &str) -> Result<(), String> {
    println!(">>> [UPLOAD] Iniciando pipeline...");

    let cli  = find_or_download_cli()?;
    let fqbn = ensure_core_installed(&cli, placa)?;

    let temp_dir    = env::temp_dir();
    let sketch_dir  = temp_dir.join("bloquin_sketch");
    let sketch_path = sketch_dir.join("bloquin_sketch.ino");

    let _ = fs::create_dir_all(&sketch_dir);

    fs::write(&sketch_path, codigo)
        .map_err(|e| format!("Erro ao criar arquivo: {}", e))?;

    println!(">>> [UPLOAD] Compilando com FQBN: {}", fqbn);
    let compile_output = Command::new(&cli)
        .hide_window()
        .args(["compile", "-b", &fqbn, sketch_dir.to_str().unwrap()])
        .output()
        .map_err(|e| format!("Erro no processo de compilação: {}", e))?;

    if !compile_output.status.success() {
        let erro = String::from_utf8_lossy(&compile_output.stderr);
        return Err(format!("Erro no código (Compilação falhou):\n{}", erro));
    }

    println!(">>> [UPLOAD] Enviando para a porta {}...", porta);
    let upload_output = Command::new(&cli)
        .hide_window()
        .args(["upload", "-b", &fqbn, "-p", porta, sketch_dir.to_str().unwrap()])
        .output()
        .map_err(|e| format!("Erro upload: {}", e))?;

    if !upload_output.status.success() {
        let erro = String::from_utf8_lossy(&upload_output.stderr);
        return Err(format!("Erro ao gravar na porta {}:\n{}", porta, erro));
    }

    println!(">>> [UPLOAD] CONCLUÍDO COM SUCESSO!");
    Ok(())
}

#[tauri::command]
fn upload_code(
    codigo: String,
    placa: String,
    porta: String,
    window: tauri::Window,
    state: tauri::State<AppState>,
) -> Result<String, String> {
    state.is_reading_serial.store(false, Ordering::Relaxed);

    let window_clone = window.clone();

    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(600));

        let result = run_upload_pipeline(&codigo, &placa, &porta);

        match result {
            Ok(_)  => { let _ = window_clone.emit("upload-result", "ok"); }
            Err(e) => { let _ = window_clone.emit("upload-result", format!("err:{}", e)); }
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
    state.is_reading_serial.store(false, Ordering::Relaxed);
    std::thread::sleep(Duration::from_millis(200));

    let is_reading = Arc::clone(&state.is_reading_serial);
    is_reading.store(true, Ordering::Relaxed);

    std::thread::spawn(move || {
            let mut port = match serialport::new(&porta, 115200)
            .timeout(Duration::from_millis(100))
            .open()
        {
            Ok(p)  => p,
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
            // Filtra apenas ASCII imprimível + \r\n — descarta lixo binário do bootloader
            let pedaco: String = serial_buf[..t]
                .iter()
                .filter(|&&b| b == b'\n' || b == b'\r' || (b >= 0x20 && b < 0x7F))
                .map(|&b| b as char)
                .collect();

            string_acumulada.push_str(&pedaco);

            // Se cresceu muito SEM newline → é lixo do boot, descarta
            if string_acumulada.len() > 300 && !string_acumulada.contains('\n') {
                string_acumulada.clear();
            } else if string_acumulada.len() > 4000 {
                string_acumulada.clear();
            }

            while let Some(pos) = string_acumulada.find('\n') {
                let frase = string_acumulada[..pos].trim_end().to_string();
                string_acumulada = string_acumulada[pos + 1..].to_string();
                if !frase.is_empty() { // não emite linhas vazias
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

    // Se a janela já existe, apenas traz para frente
    if let Some(window) = app.get_webview_window("admin-panel") {
        window.set_focus().map_err(|e| format!("Erro ao focar a janela: {}", e))?;
        return Ok("ok".to_string());
    }

    // Serializa os tokens como strings JSON (aspas + escape automático)
    let at_json = serde_json::to_string(&access_token)
        .map_err(|_| "Erro ao serializar access_token".to_string())?;
    let rt_json = serde_json::to_string(&refresh_token)
        .map_err(|_| "Erro ao serializar refresh_token".to_string())?;

    // Script executado ANTES de qualquer JS da página do SAG.
    let init_script = format!(
        "(function(){{Object.defineProperty(window,'__bloquin_auth',{{value:{{access_token:{},refresh_token:{}}},writable:false,configurable:false,enumerable:false}});}})();",
        at_json,
        rt_json
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
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            upload_code,
            start_serial,
            stop_serial,
            get_available_ports,
            open_admin_panel
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}