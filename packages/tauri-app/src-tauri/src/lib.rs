mod commands;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            // 确保窗口在启动后显示（window-state 插件的备用方案）
            let window = app.get_webview_window("main").expect("main window not found");
            let win = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                let _ = win.show();
                let _ = win.set_focus();
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::learning::get_learning_words,
            commands::learning::submit_answer,
            commands::learning::get_session,
            commands::statistics::get_statistics,
            commands::statistics::get_weekly_report,
            commands::wordbooks::list_wordbooks,
            commands::wordbooks::select_wordbook,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::reset_window_layout,
        ])
        .run(tauri::generate_context!())
        .expect("error running Danci");
}
