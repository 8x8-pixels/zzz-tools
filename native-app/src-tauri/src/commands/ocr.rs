use std::{fs, path::Path, sync::Mutex};

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};

#[derive(Default)]
pub struct OcrState {
    child: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
}

#[tauri::command]
pub async fn start_ocr(
    app: AppHandle,
    state: State<'_, OcrState>,
    tesseract_path: Option<String>,
    monitor_num: Option<u32>,
) -> Result<(), String> {
    let mut guard = state.child.lock().map_err(|_| "OCR lock failed".to_string())?;
    if guard.is_some() {
        return Err("OCR is already running".to_string());
    }

    let mut command = app
        .shell()
        .sidecar("disc_capture")
        .map_err(|e| e.to_string())?
        .args(["--monitor", "--stdout"]);

    // In dev mode, writing under `src-tauri/` triggers Tauri file watching and restarts the app.
    // Force the sidecar output to app-local-data instead.
    let ocr_out_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("ocr_live");
    fs::create_dir_all(&ocr_out_dir).map_err(|e| e.to_string())?;
    let ocr_out_dir_str = ocr_out_dir.to_string_lossy().to_string();
    command = command.args(["--out", ocr_out_dir_str.as_str()]);

    if let Some(path) = tesseract_path {
        if !path.trim().is_empty() {
            if !Path::new(&path).is_file() {
                return Err(format!("Tesseract not found: {}", path));
            }
            command = command.args(["--tesseract", path.as_str()]);
        }
    }

    if let Some(num) = monitor_num {
        command = command.args(["--monitor_num", &num.to_string()]);
    }

    let (mut rx, child) = command.spawn().map_err(|e| e.to_string())?;
    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line).trim().to_string();
                    if line_str.starts_with('{') {
                        let _ = app_handle.emit("disc-captured", line_str);
                    }
                }
                CommandEvent::Stderr(line) => {
                    let msg = String::from_utf8_lossy(&line).trim().to_string();
                    if !msg.is_empty() {
                        let _ = app_handle.emit("ocr-log", msg);
                    }
                }
                CommandEvent::Terminated(_) => {
                    if let Ok(mut guard) = app_handle.state::<OcrState>().child.lock() {
                        *guard = None;
                    }
                    let _ = app_handle.emit("ocr-stopped", ());
                    break;
                }
                _ => {}
            }
        }
    });

    *guard = Some(child);
    Ok(())
}

#[tauri::command]
pub async fn stop_ocr(state: State<'_, OcrState>) -> Result<(), String> {
    let mut guard = state.child.lock().map_err(|_| "OCR lock failed".to_string())?;
    if let Some(child) = guard.take() {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn is_ocr_running(state: State<'_, OcrState>) -> Result<bool, String> {
    let guard = state.child.lock().map_err(|_| "OCR lock failed".to_string())?;
    Ok(guard.is_some())
}
