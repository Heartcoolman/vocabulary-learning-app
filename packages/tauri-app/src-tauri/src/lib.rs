mod commands;

use tauri::Manager;

use std::fs::OpenOptions;
use std::io::Write;

fn log(msg: &str) {
    let path = dirs::desktop_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_default()
        .join("danci-startup.log");
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "[{}] {msg}", chrono::Local::now().format("%H:%M:%S%.3f"));
    }
}

pub fn run() {
    // panic hook：将 panic 信息写入桌面日志文件
    std::panic::set_hook(Box::new(|info| {
        log(&format!("PANIC: {info}"));
    }));

    log("=== Danci startup ===");

    log("building tauri app...");
    let builder = tauri::Builder::default()
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
            log("setup: looking for main window...");
            let window = app
                .get_webview_window("main")
                .expect("main window not found");
            log("setup: main window found, spawning show thread");
            let win = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                let _ = win.show();
                let _ = win.set_focus();
            });
            log("setup: complete");
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
        ]);

    log("calling run()...");
    match builder.run(tauri::generate_context!()) {
        Ok(()) => log("run() returned Ok"),
        Err(e) => {
            log(&format!("run() FAILED: {e}"));
            // 在 Windows 上也弹出一个消息框让用户看到错误
            #[cfg(target_os = "windows")]
            {
                use std::ffi::CString;
                let msg = CString::new(format!("Danci failed to start:\n{e}")).unwrap_or_default();
                let title = CString::new("Danci Error").unwrap_or_default();
                unsafe {
                    extern "system" {
                        fn MessageBoxA(
                            hwnd: *mut std::ffi::c_void,
                            text: *const i8,
                            caption: *const i8,
                            utype: u32,
                        ) -> i32;
                    }
                    MessageBoxA(
                        std::ptr::null_mut(),
                        msg.as_ptr(),
                        title.as_ptr(),
                        0x10, // MB_ICONERROR
                    );
                }
            }
        }
    }
}
