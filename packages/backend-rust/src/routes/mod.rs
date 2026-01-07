mod about;
mod admin;
mod alerts;
mod algorithm_config;
mod amas;
mod badges;
mod debug;
mod emergency;
mod etymology;
mod evaluation;
mod experiments;
mod habit_profile;
mod health;
mod learning;
mod learning_objectives;
mod learning_sessions;
mod llm_advisor;
mod logs;
pub mod notifications;
mod optimization;
mod plan;
mod preferences;
pub mod realtime;
mod records;
mod study_config;
mod tracking;
mod v1_auth;
mod v1_sessions;
mod visual_fatigue;
mod word_contexts;
mod word_mastery;
mod word_scores;
mod word_states;
mod users;
mod words;
mod wordbooks;

use axum::http::StatusCode;
use axum::middleware;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post, put};
use axum::Router;

use crate::middleware::csrf::{csrf_token_middleware, csrf_validation_middleware};
use crate::middleware::rate_limit::{api_rate_limit_middleware, auth_rate_limit_middleware};
use crate::response::json_error;
use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    let enable_study_config = env_bool("RUST_ENABLE_STUDY_CONFIG").unwrap_or(true);
    let enable_records = env_bool("RUST_ENABLE_RECORDS").unwrap_or(true);
    let enable_learning = env_bool("RUST_ENABLE_LEARNING").unwrap_or(true);
    let healthcheck_endpoint = normalize_healthcheck_endpoint(
        std::env::var("HEALTHCHECK_ENDPOINT")
            .ok()
            .as_deref()
            .unwrap_or("/health"),
    );

    let mut app = Router::new()
        .route(
            "/api/v1/auth/verify",
            get(v1_auth::verify).fallback(fallback_handler),
        )
        .route(
            "/api/v1/auth/login",
            post(v1_auth::login).fallback(fallback_handler),
        )
        .route(
            "/api/v1/auth/register",
            post(v1_auth::register).fallback(fallback_handler),
        )
        .route(
            "/api/v1/auth/logout",
            post(v1_auth::logout).fallback(fallback_handler),
        )
        .route(
            "/api/v1/auth/refresh_token",
            post(v1_auth::refresh_token).fallback(fallback_handler),
        )
        .route(
            "/api/auth/login",
            post(v1_auth::login).fallback(fallback_handler),
        )
        .route(
            "/api/auth/register",
            post(v1_auth::register).fallback(fallback_handler),
        )
        .route(
            "/api/auth/logout",
            post(v1_auth::logout).fallback(fallback_handler),
        )
        .route(
            "/api/auth/password/request",
            post(v1_auth::request_password_reset).fallback(fallback_handler),
        )
        .route(
            "/api/auth/password/reset",
            post(v1_auth::reset_password).fallback(fallback_handler),
        )
        .route("/api/users/me", get(users::me).put(users::update_profile).fallback(fallback_handler))
        .route("/api/users/me/statistics", get(users::statistics).fallback(fallback_handler))
        .route("/api/users/me/password", put(users::update_password).fallback(fallback_handler))
        .route(
            "/api/users/profile/reward",
            get(users::reward_profile)
                .put(users::update_reward_profile)
                .fallback(fallback_handler),
        )
        .route(
            "/api/users/profile/chronotype",
            get(users::chronotype).fallback(fallback_handler),
        )
        .route(
            "/api/users/profile/learning-style",
            get(users::learning_style).fallback(fallback_handler),
        )
        .route(
            "/api/users/profile/cognitive",
            get(users::cognitive).fallback(fallback_handler),
        )
        .route(
            "/api/preferences",
            get(preferences::get_preferences)
                .put(preferences::update_preferences)
                .fallback(fallback_handler),
        )
        .route(
            "/api/preferences/learning",
            get(preferences::learning_preferences)
                .put(preferences::update_learning_preferences)
                .fallback(fallback_handler),
        )
        .route(
            "/api/preferences/notification",
            get(preferences::notification_preferences)
                .put(preferences::update_notification_preferences)
                .fallback(fallback_handler),
        )
        .route(
            "/api/preferences/ui",
            get(preferences::ui_preferences)
                .put(preferences::update_ui_preferences)
                .fallback(fallback_handler),
        )
        .route(
            "/api/preferences/reset",
            post(preferences::reset_preferences).fallback(fallback_handler),
        )
        .route(
            "/api/preferences/quiet-hours/check",
            get(preferences::quiet_hours_check).fallback(fallback_handler),
        )
        .route(
            "/api/algorithm-config",
            get(algorithm_config::get_active).fallback(fallback_handler),
        )
        .route(
            "/api/algorithm-config/reset",
            post(algorithm_config::reset_config).fallback(fallback_handler),
        )
        .route(
            "/api/algorithm-config/history",
            get(algorithm_config::history).fallback(fallback_handler),
        )
        .route(
            "/api/algorithm-config/presets",
            get(algorithm_config::presets).fallback(fallback_handler),
        )
        .route(
            "/api/algorithm-config/:id",
            put(algorithm_config::update_config).fallback(fallback_handler),
        )
        .route(
            "/api/notifications",
            get(notifications::list_notifications).fallback(fallback_handler),
        )
        .route("/api/logs", post(logs::ingest).fallback(fallback_handler))
        .route("/api/logs/health", get(logs::health).fallback(fallback_handler))
        .route(
            "/api/notifications/stats",
            get(notifications::stats).fallback(fallback_handler),
        )
        .route(
            "/api/notifications/read-all",
            put(notifications::read_all).fallback(fallback_handler),
        )
        .route(
            "/api/notifications/batch/read",
            put(notifications::batch_read).fallback(fallback_handler),
        )
        .route(
            "/api/notifications/batch",
            axum::routing::delete(notifications::batch_delete).fallback(fallback_handler),
        )
        .route(
            "/api/notifications/:id/read",
            put(notifications::mark_read).fallback(fallback_handler),
        )
        .route(
            "/api/notifications/:id/archive",
            put(notifications::archive).fallback(fallback_handler),
        )
        .route(
            "/api/notifications/:id",
            get(notifications::get_notification)
                .delete(notifications::delete_notification)
                .fallback(fallback_handler),
        )
        .route(
            "/api/emergency/config",
            get(emergency::get_config).fallback(fallback_handler),
        )
        .route(
            "/api/learning-objectives",
            get(learning_objectives::get_objectives)
                .put(learning_objectives::upsert_objectives)
                .delete(learning_objectives::delete_objectives)
                .fallback(fallback_handler),
        )
        .route(
            "/api/learning-objectives/switch-mode",
            post(learning_objectives::switch_mode).fallback(fallback_handler),
        )
        .route(
            "/api/learning-objectives/suggestions",
            get(learning_objectives::suggestions).fallback(fallback_handler),
        )
        .route(
            "/api/learning-objectives/history",
            get(learning_objectives::history).fallback(fallback_handler),
        )
        .route(
            "/api/words",
            get(words::list_words)
                .post(words::create_word)
                .fallback(fallback_handler),
        )
        .route(
            "/api/words/search",
            get(words::search_words).fallback(fallback_handler),
        )
        .route(
            "/api/words/learned",
            get(words::learned_words).fallback(fallback_handler),
        )
        .route(
            "/api/words/batch",
            post(words::batch_create).fallback(fallback_handler),
        )
        .route(
            "/api/words/batch-delete",
            post(words::batch_delete_words).fallback(fallback_handler),
        )
        .route(
            "/api/words/:id",
            get(words::get_word_by_id)
                .put(words::update_word)
                .delete(words::delete_word)
                .fallback(fallback_handler),
        )
        .route(
            "/api/wordbooks/user",
            get(wordbooks::list_user_wordbooks).fallback(fallback_handler),
        )
        .route(
            "/api/wordbooks/system",
            get(wordbooks::list_system_wordbooks).fallback(fallback_handler),
        )
        .route(
            "/api/wordbooks/available",
            get(wordbooks::list_available_wordbooks).fallback(fallback_handler),
        )
        .route(
            "/api/wordbooks",
            post(wordbooks::create_wordbook).fallback(fallback_handler),
        )
        .route(
            "/api/wordbooks/:id",
            get(wordbooks::get_wordbook)
                .put(wordbooks::update_wordbook)
                .delete(wordbooks::delete_wordbook)
                .fallback(fallback_handler),
        )
        .route(
            "/api/wordbooks/:id/words",
            get(wordbooks::get_wordbook_words)
                .post(wordbooks::add_word_to_wordbook)
                .fallback(fallback_handler),
        )
        .route(
            "/api/wordbooks/:id/words/batch",
            post(wordbooks::batch_add_words_to_wordbook).fallback(fallback_handler),
        )
        .route(
            "/api/wordbooks/:wordBookId/words/:wordId",
            axum::routing::delete(wordbooks::remove_word_from_wordbook).fallback(fallback_handler),
        )
        .route("/api/v1/users/me", get(users::me).fallback(fallback_handler))
        .route(
            "/api/v1/users/me/statistics",
            get(users::statistics).fallback(fallback_handler),
        )
        .route(
            "/api/v1/users/me/password",
            put(users::update_password).fallback(fallback_handler),
        )
        .route(
            "/api/v1/users/me/profile",
            get(users::v1_me_profile).fallback(fallback_handler),
        )
        .route(
            "/api/v1/users/me/reward-profile",
            get(users::v1_reward_profile)
                .put(users::v1_update_reward_profile)
                .fallback(fallback_handler),
        )
        .route(
            "/api/v1/users/me/chronotype",
            get(users::chronotype).fallback(fallback_handler),
        )
        .route(
            "/api/v1/users/me/learning-style",
            get(users::learning_style).fallback(fallback_handler),
        )
        .route(
            "/api/v1/words",
            get(words::list_words)
                .post(words::create_word)
                .fallback(fallback_handler),
        )
        .route(
            "/api/v1/words/search",
            get(words::v1_search_words).fallback(fallback_handler),
        )
        .route(
            "/api/v1/words/learned",
            get(words::learned_words).fallback(fallback_handler),
        )
        .route(
            "/api/v1/words/batch",
            post(words::batch_create).fallback(fallback_handler),
        )
        .route(
            "/api/v1/words/:id",
            get(words::get_word_by_id)
                .put(words::update_word)
                .delete(words::delete_word)
                .fallback(fallback_handler),
        )
        .route(
            "/api/v1/sessions",
            get(v1_sessions::list)
                .post(v1_sessions::create)
                .fallback(fallback_handler),
        )
        .route(
            "/api/v1/sessions/:sessionId",
            get(v1_sessions::get).fallback(fallback_handler),
        )
        .route(
            "/api/v1/sessions/:sessionId/progress",
            put(v1_sessions::sync_progress).fallback(fallback_handler),
        )
        .route(
            "/api/v1/sessions/:sessionId/records",
            get(v1_sessions::records).fallback(fallback_handler),
        );

    if enable_study_config {
        app = app
            .route(
                "/api/study-config",
                get(study_config::get_config)
                    .put(study_config::update_config)
                    .fallback(fallback_handler),
            )
            .route(
                "/api/study-config/today-words",
                get(study_config::today_words).fallback(fallback_handler),
            )
            .route(
                "/api/study-config/progress",
                get(study_config::progress).fallback(fallback_handler),
            );
    }

    if enable_records {
        app = app
            .route(
                "/api/records",
                get(records::list_records)
                    .post(records::create_record)
                    .fallback(fallback_handler),
            )
            .route(
                "/api/records/batch",
                post(records::batch_create_records).fallback(fallback_handler),
            )
            .route(
                "/api/records/statistics",
                get(records::statistics).fallback(fallback_handler),
            )
            .route(
                "/api/records/statistics/enhanced",
                get(records::enhanced_statistics).fallback(fallback_handler),
            )
            .route(
                "/api/v1/learning/records",
                get(records::v1_list_learning_records)
                    .post(records::v1_create_learning_record)
                    .fallback(fallback_handler),
            )
            .route(
                "/api/v1/learning/records/batch",
                post(records::v1_batch_create_learning_records).fallback(fallback_handler),
            )
            .route(
                "/api/v1/learning/statistics",
                get(records::v1_learning_statistics).fallback(fallback_handler),
            );
    }

    if enable_learning {
        app = app
            .route(
                "/api/learning/study-words",
                get(learning::study_words).fallback(fallback_handler),
            )
            .route(
                "/api/learning/next-words",
                post(learning::next_words).fallback(fallback_handler),
            )
            .route(
                "/api/learning/session",
                post(learning::create_session).fallback(fallback_handler),
            )
            .route(
                "/api/learning/sync-progress",
                post(learning::sync_progress).fallback(fallback_handler),
            )
            .route(
                "/api/learning/session/:sessionId",
                get(learning::session_progress).fallback(fallback_handler),
            )
            .route(
                "/api/learning/adjust-words",
                post(learning::adjust_words).fallback(fallback_handler),
            )
            .route(
                "/api/v1/learning/study-words",
                get(learning::v1_study_words).fallback(fallback_handler),
            )
            .route(
                "/api/v1/learning/next-words",
                post(learning::v1_next_words).fallback(fallback_handler),
            )
            .route(
                "/api/v1/learning/adjust-words",
                post(learning::v1_adjust_words).fallback(fallback_handler),
            )
            .route(
                "/api/word-states/batch",
                post(word_states::batch_get).fallback(fallback_handler),
            )
            .route(
                "/api/word-states/due/list",
                get(word_states::due_list).fallback(fallback_handler),
            )
            .route(
                "/api/word-states/by-state/:state",
                get(word_states::by_state).fallback(fallback_handler),
            )
            .route(
                "/api/word-states/stats/overview",
                get(word_states::stats_overview).fallback(fallback_handler),
            )
            .route(
                "/api/word-states/:wordId",
                get(word_states::get_one)
                    .put(word_states::upsert_one)
                    .delete(word_states::delete_one)
                    .fallback(fallback_handler),
            )
            .route(
                "/api/word-states/:wordId/mark-mastered",
                post(word_states::mark_mastered).fallback(fallback_handler),
            )
            .route(
                "/api/word-states/:wordId/mark-needs-practice",
                post(word_states::mark_needs_practice).fallback(fallback_handler),
            )
            .route(
                "/api/word-states/:wordId/reset",
                post(word_states::reset_progress).fallback(fallback_handler),
            )
            .route(
                "/api/word-states/batch-update",
                post(word_states::batch_update).fallback(fallback_handler),
            )
            .route(
                "/api/word-scores/range",
                get(word_scores::range).fallback(fallback_handler),
            )
            .route(
                "/api/word-scores/low/list",
                get(word_scores::low_list).fallback(fallback_handler),
            )
            .route(
                "/api/word-scores/high/list",
                get(word_scores::high_list).fallback(fallback_handler),
            )
            .route(
                "/api/word-scores/stats/overview",
                get(word_scores::stats_overview).fallback(fallback_handler),
            )
            .route(
                "/api/word-scores/batch",
                post(word_scores::batch_get).fallback(fallback_handler),
            )
            .route(
                "/api/word-scores/:wordId",
                get(word_scores::get_one)
                    .put(word_scores::upsert_one)
                    .fallback(fallback_handler),
            );
    }

    let middleware_state = state.clone();

    app = app.nest("/api/about", about::router());
    app = app.nest(
        "/api/admin",
        admin::router().layer(middleware::from_fn_with_state(
            middleware_state.clone(),
            admin::require_admin,
        )),
    );
    app = app.nest("/api/alerts", alerts::router());
    app = app.nest("/api/amas", amas::router());
    app = app.nest("/api/badges", badges::router());
    app = app.nest("/api/debug", debug::router());
    app = app.nest("/api/etymology", etymology::routes());
    app = app.nest("/api/evaluation", evaluation::router());
    app = app.nest("/api/experiments", experiments::router());
    app = app.nest("/api/habit-profile", habit_profile::router());
    app = app.nest("/api/learning-sessions", learning_sessions::router());
    app = app.nest("/api/llm-advisor", llm_advisor::router());
    app = app.nest("/api/optimization", optimization::router());
    app = app.nest("/api/plan", plan::router());
    app = app.nest("/api/v1/realtime", realtime::router());
    app = app.nest("/api/tracking", tracking::router());
    app = app.nest("/api/visual-fatigue", visual_fatigue::router());
    app = app.nest("/api/word-contexts", word_contexts::router());
    app = app.nest("/api/word-mastery", word_mastery::router());

    let mut health_paths: Vec<String> = Vec::new();
    health_paths.push("/health".to_string());
    if healthcheck_endpoint.as_str() != "/health" {
        health_paths.push(healthcheck_endpoint);
    }
    if !health_paths.iter().any(|path| path == "/api/health") {
        health_paths.push("/api/health".to_string());
    }

    for path in &health_paths {
        app = app.nest(path.as_str(), health::router());
    }

    app
        .layer(middleware::from_fn(csrf_validation_middleware))
        .layer(middleware::from_fn(csrf_token_middleware))
        .layer(middleware::from_fn(auth_rate_limit_middleware))
        .layer(middleware::from_fn(api_rate_limit_middleware))
        .fallback(fallback_handler)
        .with_state(state)
}

fn env_bool(key: &str) -> Option<bool> {
    let value = std::env::var(key).ok()?;
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return None;
    }
    match normalized.as_str() {
        "1" | "true" | "yes" | "y" | "on" => Some(true),
        "0" | "false" | "no" | "n" | "off" => Some(false),
        _ => None,
    }
}

fn normalize_healthcheck_endpoint(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "/health".to_string();
    }

    let with_slash = if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    };

    if with_slash != "/" {
        with_slash.trim_end_matches('/').to_string()
    } else {
        "/".to_string()
    }
}

async fn fallback_handler() -> Response {
    json_error(StatusCode::NOT_FOUND, "NOT_FOUND", "接口不存在").into_response()
}
