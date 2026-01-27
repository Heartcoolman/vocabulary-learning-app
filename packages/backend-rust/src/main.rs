use std::net::SocketAddr;
use std::sync::Arc;

use http::{header, Method};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use danci_backend_rust::cache::RedisCache;
use danci_backend_rust::config::Config;
use danci_backend_rust::db;
use danci_backend_rust::logging;
use danci_backend_rust::routes;
use danci_backend_rust::services::quality_service;
use danci_backend_rust::state::AppState;
use danci_backend_rust::workers::WorkerManager;

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();

    if let Some(cmd) = std::env::args().nth(1) {
        match cmd.as_str() {
            "seed-admin" => return run_seed_admin().await,
            "migrate-admins" => return run_migrate_admins().await,
            _ => {}
        }
    }

    let config = Config::from_env();

    let _file_log_guard = logging::init_tracing(&config.log_level);

    let db_proxy = match db::DatabaseProxy::from_env().await {
        Ok(proxy) => Some(proxy),
        Err(err) => {
            tracing::warn!(error = %err, "database proxy not initialized");
            None
        }
    };

    if let Some(ref proxy) = db_proxy {
        quality_service::cleanup_stale_tasks(proxy).await;
        if let Err(err) =
            danci_backend_rust::amas::metrics_persistence::restore_registry_from_db(proxy.as_ref())
                .await
        {
            tracing::warn!(error = %err, "failed to restore algorithm metrics");
        }
        danci_backend_rust::seed::seed_test_users(proxy.as_ref()).await;
    }

    let cache = match std::env::var("REDIS_URL") {
        Ok(redis_url) => match RedisCache::connect(&redis_url).await {
            Ok(c) => {
                tracing::info!("Redis cache connected");
                Some(Arc::new(c))
            }
            Err(err) => {
                tracing::warn!(error = %err, "Redis cache not initialized");
                None
            }
        },
        Err(_) => None,
    };

    let amas_engine = AppState::create_amas_engine(db_proxy.clone());
    if let Err(err) = amas_engine.reload_config().await {
        tracing::warn!(error = %err, "failed to reload AMAS config");
    }

    let worker_manager = if let Some(ref proxy) = db_proxy {
        match WorkerManager::new(Arc::clone(proxy), Arc::clone(&amas_engine)).await {
            Ok(manager) => {
                if let Err(e) = manager.start().await {
                    tracing::error!(error = %e, "failed to start workers");
                }
                Some(Arc::new(manager))
            }
            Err(e) => {
                tracing::warn!(error = %e, "worker manager not initialized");
                None
            }
        }
    } else {
        None
    };

    let state = AppState::new(db_proxy, amas_engine, cache);

    let cors = match std::env::var("CORS_ORIGIN") {
        Ok(origin) if !origin.is_empty() => {
            tracing::info!(origin = %origin, "CORS configured with specific origin");
            CorsLayer::new()
                .allow_origin(
                    origin
                        .parse::<header::HeaderValue>()
                        .expect("invalid CORS_ORIGIN"),
                )
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::PUT,
                    Method::DELETE,
                    Method::OPTIONS,
                ])
                .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, header::ACCEPT])
                .allow_credentials(true)
        }
        _ => {
            tracing::info!("CORS configured as permissive");
            CorsLayer::permissive()
        }
    };

    let app = routes::router(state)
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    let addr = config.bind_addr();
    tracing::info!(%addr, "backend-rust listening");

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind listener failed");

    let server = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal());

    if let Err(e) = server.await {
        tracing::error!(error = %e, "server error");
    }

    tracing::info!("HTTP server stopped, initiating graceful shutdown sequence");

    if let Some(ref manager) = worker_manager {
        manager.stop().await;
    }

    tracing::info!("Graceful shutdown complete");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{signal, SignalKind};
        let mut sigterm =
            signal(SignalKind::terminate()).expect("failed to install SIGTERM handler");
        sigterm.recv().await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

async fn run_seed_admin() {
    use sqlx::postgres::PgPoolOptions;
    use std::time::Duration;

    let args: Vec<String> = std::env::args().collect();
    let mut username = None;
    let mut email = None;
    let mut password = None;

    let mut i = 2;
    while i < args.len() {
        match args[i].as_str() {
            "--username" => {
                username = args.get(i + 1).cloned();
                i += 2;
            }
            "--email" => {
                email = args.get(i + 1).cloned();
                i += 2;
            }
            "--password" => {
                password = args.get(i + 1).cloned();
                i += 2;
            }
            _ => i += 1,
        }
    }

    let username = username.expect("--username is required");
    let email = email.expect("--email is required");
    let password = password.expect("--password is required");

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL not set");
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&db_url)
        .await
        .expect("failed to connect to database");

    let existing: Option<i64> =
        sqlx::query_scalar(r#"SELECT COUNT(*) FROM "admin_users" WHERE "email" = $1"#)
            .bind(&email)
            .fetch_one(&pool)
            .await
            .ok();

    if existing.unwrap_or(0) > 0 {
        println!("ADMIN_EXISTS");
        return;
    }

    let password_hash = bcrypt::hash(&password, 10).expect("failed to hash password");
    let admin_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().naive_utc();

    let result = sqlx::query(
        r#"
        INSERT INTO "admin_users" ("id", "email", "passwordHash", "username", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $5)
        "#,
    )
    .bind(&admin_id)
    .bind(&email)
    .bind(&password_hash)
    .bind(&username)
    .bind(now)
    .execute(&pool)
    .await;

    match result {
        Ok(_) => println!("ADMIN_CREATED"),
        Err(e) => {
            eprintln!("Failed to create admin: {}", e);
            std::process::exit(1);
        }
    }
}

async fn run_migrate_admins() {
    use sqlx::postgres::PgPoolOptions;
    use sqlx::Row;
    use std::time::Duration;

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL not set");
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&db_url)
        .await
        .expect("failed to connect to database");

    let admins = sqlx::query(
        r#"
        SELECT "id", "email", "passwordHash", "username", "createdAt"
        FROM "users"
        WHERE "role"::text = 'ADMIN'
        "#,
    )
    .fetch_all(&pool)
    .await
    .expect("failed to query admins");

    let mut migrated = 0;
    let mut skipped = 0;

    for row in admins {
        let email: String = row.try_get("email").unwrap_or_default();
        let password_hash: String = row.try_get("passwordHash").unwrap_or_default();
        let username: String = row.try_get("username").unwrap_or_default();
        let created_at: chrono::NaiveDateTime = row.try_get("createdAt").unwrap_or_else(|_| chrono::Utc::now().naive_utc());

        let admin_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().naive_utc();

        let result = sqlx::query(
            r#"
            INSERT INTO "admin_users" ("id", "email", "passwordHash", "username", "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT ("email") DO UPDATE SET
                "passwordHash" = EXCLUDED."passwordHash",
                "username" = EXCLUDED."username",
                "updatedAt" = EXCLUDED."updatedAt"
            "#,
        )
        .bind(&admin_id)
        .bind(&email)
        .bind(&password_hash)
        .bind(&username)
        .bind(created_at)
        .bind(now)
        .execute(&pool)
        .await;

        match result {
            Ok(_) => {
                migrated += 1;
                println!("Migrated: {}", email);
            }
            Err(e) => {
                skipped += 1;
                eprintln!("Failed to migrate {}: {}", email, e);
            }
        }
    }

    println!("Migration complete: {} migrated, {} skipped", migrated, skipped);
}
