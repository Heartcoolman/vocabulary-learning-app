// Tauri 2.0 Mobile/Desktop 库入口文件
// 用于移动端和桌面端共享的核心逻辑

mod commands;
mod platform;
mod storage;

use commands::actr::ACTRState;
use commands::linucb::LinUCBState;
use commands::storage::AppStorageState;
use commands::thompson::ThompsonSamplingState;
#[cfg(all(debug_assertions, not(target_os = "android"), not(target_os = "ios")))]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 设置 panic hook 来记录详细的崩溃信息
    #[cfg(target_os = "android")]
    {
        std::panic::set_hook(Box::new(|panic_info| {
            let msg = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
                s.clone()
            } else {
                "Unknown panic".to_string()
            };
            let location = panic_info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_else(|| "unknown".to_string());
            log::error!("PANIC at {}: {}", location, msg);
        }));
    }

    log::info!("Starting Danci app...");

    let builder = tauri::Builder::default();
    log::info!("Builder created");

    let builder = builder
        // SQL 插件 - 本地数据库支持
        .plugin(tauri_plugin_sql::Builder::default().build());
    log::info!("SQL plugin added");

    let builder = builder
        // HTTP 插件 - 网络请求支持
        .plugin(tauri_plugin_http::init());
    log::info!("HTTP plugin added");

    let builder = builder
        // Store 插件 - 持久化存储支持
        .plugin(tauri_plugin_store::Builder::default().build());
    log::info!("Store plugin added");

    let builder = builder
        // 管理应用状态
        .manage(AppStorageState::default())
        .manage(LinUCBState::default())
        .manage(ACTRState::default())
        .manage(ThompsonSamplingState::default());
    log::info!("State managed");

    let builder = builder
        // 注册自定义命令
        .invoke_handler(tauri::generate_handler![
            // 基础命令
            commands::greet,
            // 存储命令 - 数据库初始化
            commands::init_database,
            // 存储命令 - Word 操作
            commands::get_word,
            commands::get_words_by_book,
            commands::search_words,
            commands::download_word_book,
            // 存储命令 - 学习状态
            commands::get_learning_state,
            commands::save_learning_state,
            commands::get_due_words,
            commands::get_learning_stats,
            // 存储命令 - 答题记录
            commands::save_answer_record,
            commands::get_today_stats,
            // 存储命令 - 同步
            commands::sync_to_cloud,
            commands::sync_from_cloud,
            commands::get_sync_status,
            // TTS 命令
            commands::tts_speak,
            commands::tts_stop,
            commands::tts_get_status,
            commands::tts_initialize,
            commands::tts_is_language_supported,
            // 视觉疲劳检测命令
            commands::fatigue_initialize,
            commands::fatigue_start_detection,
            commands::fatigue_stop_detection,
            commands::fatigue_get_metrics,
            commands::fatigue_get_capability,
            commands::fatigue_get_state,
            // 权限管理命令
            commands::check_permission,
            commands::request_permission,
            commands::open_app_settings,
            commands::should_show_rationale,
            commands::is_native_permission_supported,
            // LinUCB 算法命令
            commands::linucb_select_action,
            commands::linucb_select_action_typed,
            commands::linucb_select_action_batch,
            commands::linucb_update,
            commands::linucb_update_with_feature_vector,
            commands::linucb_update_batch,
            commands::linucb_diagnose,
            commands::linucb_self_test,
            commands::linucb_get_model,
            commands::linucb_set_model,
            commands::linucb_reset,
            commands::linucb_get_alpha,
            commands::linucb_set_alpha,
            commands::linucb_get_update_count,
            commands::linucb_get_cold_start_alpha,
            // ACT-R 算法命令
            commands::actr_compute_activation,
            commands::actr_compute_activation_absolute,
            commands::actr_retrieval_probability,
            commands::actr_compute_personalized_decay,
            commands::actr_compute_optimal_interval,
            commands::actr_compute_full_activation,
            commands::actr_predict_recall,
            commands::actr_predict_optimal_interval,
            commands::actr_batch_compute_activations,
            commands::actr_batch_compute_activations_from_seconds_ago,
            commands::actr_batch_compute_optimal_intervals,
            commands::actr_get_state,
            commands::actr_set_state,
            commands::actr_update,
            commands::actr_reset,
            commands::actr_compute_memory_strength,
            commands::actr_select_action,
            // Thompson Sampling 算法命令
            commands::thompson_sample_beta,
            commands::thompson_sample_gamma,
            commands::thompson_batch_sample,
            commands::thompson_batch_sample_with_context,
            commands::thompson_select_action,
            commands::thompson_select_action_with_context,
            commands::thompson_update,
            commands::thompson_update_with_reward,
            commands::thompson_update_with_context,
            commands::thompson_update_with_context_and_reward,
            commands::thompson_batch_update,
            commands::thompson_get_expected_value,
            commands::thompson_get_expected_value_with_context,
            commands::thompson_get_sample_count,
            commands::thompson_get_global_params,
            commands::thompson_get_context_params,
            commands::thompson_set_global_params,
            commands::thompson_set_context_params,
            commands::thompson_get_all_stats,
            commands::thompson_get_update_count,
            commands::thompson_reset,
            commands::thompson_get_state,
            commands::thompson_set_state,
            commands::thompson_set_seed,
            // Causal 因果推断命令
            commands::causal_create,
            commands::causal_fit_propensity,
            commands::causal_fit_outcome,
            commands::causal_fit,
            commands::causal_estimate_ate,
            commands::causal_bootstrap_se,
            commands::causal_diagnose_propensity,
            commands::causal_get_propensity_score,
            commands::causal_predict_outcome,
            commands::causal_is_fitted,
            commands::causal_get_feature_dim,
            commands::causal_reset,
            commands::causal_compute_ite,
            commands::causal_batch_compute_ite,
            commands::causal_get_propensity_weights,
            commands::causal_get_outcome_weights_treatment,
            commands::causal_get_outcome_weights_control,
        ])
        .setup(|_app| {
            log::info!("Setup callback started");
            // 只在桌面端 debug 模式下打开 devtools
            // Android/iOS 移动端不支持 devtools，且窗口获取方式不同
            #[cfg(all(debug_assertions, not(target_os = "android"), not(target_os = "ios")))]
            {
                if let Some(window) = _app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            log::info!("Setup callback completed");
            Ok(())
        });
    log::info!("Setup registered, calling run...");

    match builder.run(tauri::generate_context!()) {
        Ok(_) => log::info!("App finished successfully"),
        Err(e) => {
            log::error!("App failed to run: {:?}", e);
            panic!("Tauri app error: {:?}", e);
        }
    }
}
