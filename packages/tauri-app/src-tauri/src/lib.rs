mod commands;

use std::fs::OpenOptions;
use std::io::Write;
use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

pub struct SidecarState {
    pub port: Mutex<Option<u16>>,
    child: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
}

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
    std::panic::set_hook(Box::new(|info| {
        log(&format!("PANIC: {info}"));
    }));

    log("=== Danci startup ===");

    log("building tauri app...");
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(SidecarState {
            port: Mutex::new(None),
            child: Mutex::new(None),
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                log("window close requested, killing sidecar");
                if let Ok(mut guard) = window.state::<SidecarState>().child.lock() {
                    if let Some(c) = guard.take() {
                        let _ = c.kill();
                    }
                }
                if let Ok(mut port) = window.state::<SidecarState>().port.lock() {
                    *port = None;
                }
            }
        })
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

            spawn_sidecar(app.handle().clone());

            log("setup: complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::reset_window_layout,
            commands::sidecar::get_sidecar_port,
        ]);

    log("calling run()...");
    match builder.run(tauri::generate_context!()) {
        Ok(()) => log("run() returned Ok"),
        Err(e) => {
            log(&format!("run() FAILED: {e}"));
            show_error_dialog(&format!("Danci failed to start:\n{e}"));
        }
    }
}

fn spawn_sidecar(handle: tauri::AppHandle) {
    spawn_sidecar_inner(handle, 0);
}

fn spawn_sidecar_inner(handle: tauri::AppHandle, restart_count: u32) {
    const MAX_RESTARTS: u32 = 3;

    let cmd = handle
        .shell()
        .sidecar("binaries/danci-backend")
        .expect("failed to create sidecar command")
        .env("HOST", "127.0.0.1")
        .env("PORT", "0");

    let (mut rx, child) = cmd.spawn().expect("failed to spawn sidecar");

    log(&format!("sidecar spawned (pid={})", child.pid()));

    // Store child in state for graceful shutdown on window close
    if let Ok(mut guard) = handle.state::<SidecarState>().child.lock() {
        *guard = Some(child);
    }

    let h = handle.clone();
    let h_restart = handle.clone();

    tauri::async_runtime::spawn(async move {
        let mut port_found = false;

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    let line = line.trim();

                    if !port_found {
                        if let Some(port_str) = line.strip_prefix("LISTENING_PORT=") {
                            if let Ok(port) = port_str.parse::<u16>() {
                                log(&format!("sidecar port: {port}"));

                                if health_check(port).await {
                                    log("sidecar health check passed");
                                    if let Ok(mut p) = h.state::<SidecarState>().port.lock() {
                                        *p = Some(port);
                                    }
                                    port_found = true;
                                } else {
                                    log("sidecar health check failed");
                                }
                            }
                        }
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes);
                    log(&format!("sidecar stderr: {}", line.trim()));
                }
                CommandEvent::Terminated(payload) => {
                    let code = payload.code.unwrap_or(-1);
                    log(&format!(
                        "sidecar terminated (code={code}, signal={:?}, restarts={restart_count})",
                        payload.signal
                    ));

                    if let Ok(mut p) = h.state::<SidecarState>().port.lock() {
                        *p = None;
                    }
                    if let Ok(mut guard) = h.state::<SidecarState>().child.lock() {
                        let _ = guard.take();
                    }

                    if code == 0 {
                        return;
                    }

                    if restart_count < MAX_RESTARTS {
                        log(&format!(
                            "restarting sidecar in 2s (attempt {}/{})",
                            restart_count + 1,
                            MAX_RESTARTS
                        ));
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        spawn_sidecar_inner(h_restart, restart_count + 1);
                    } else {
                        log("sidecar exceeded max restarts");
                        show_error_dialog("后端服务启动失败，请重启应用或联系支持。\n\nBackend service failed to start. Please restart the application.");
                    }
                    return;
                }
                CommandEvent::Error(err) => {
                    log(&format!("sidecar error: {err}"));
                }
                _ => {}
            }
        }
    });
}

fn show_error_dialog(msg: &str) {
    #[cfg(target_os = "windows")]
    {
        use std::ffi::CString;
        let msg = CString::new(msg).unwrap_or_default();
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
    #[cfg(not(target_os = "windows"))]
    {
        let _ = msg;
    }
}

async fn health_check(port: u16) -> bool {
    let url = format!("http://127.0.0.1:{port}/api/health");
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap();

    for _ in 0..50 {
        if client.get(&url).send().await.is_ok_and(|r| r.status().is_success()) {
            return true;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    false
}
