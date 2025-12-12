// Tauri 2.0 桌面端入口文件
// 此文件仅用于桌面端构建，移动端使用 lib.rs 的 mobile_entry_point

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    danci_app_lib::run();
}
