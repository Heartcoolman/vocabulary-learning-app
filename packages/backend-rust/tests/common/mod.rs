use axum::Router;

pub async fn create_test_app() -> Router {
    std::env::set_var("NODE_ENV", "test");
    std::env::set_var("DATABASE_URL", "");
    std::env::set_var("SQLITE_FALLBACK_ENABLED", "false");

    danci_backend_rust::create_app().await
}
