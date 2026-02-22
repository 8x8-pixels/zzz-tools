mod commands;

use commands::ocr::OcrState;

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .manage(OcrState::default())
    .invoke_handler(tauri::generate_handler![
      commands::ocr::start_ocr,
      commands::ocr::stop_ocr,
      commands::ocr::is_ocr_running,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
