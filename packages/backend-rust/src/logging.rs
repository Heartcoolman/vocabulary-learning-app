use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub struct FileLogGuard {
    _guard: WorkerGuard,
}

pub fn file_logging_enabled() -> bool {
    std::env::var("ENABLE_FILE_LOGS")
        .map(|v| v == "true" || v == "1")
        .unwrap_or(false)
}

pub fn init_tracing(log_level: &str) -> Option<FileLogGuard> {
    let env_filter = EnvFilter::try_new(log_level).unwrap_or_else(|_| EnvFilter::new("info"));
    let stdout_layer = fmt::layer().with_target(true);

    if file_logging_enabled() {
        let log_dir = std::env::var("LOG_DIR").unwrap_or_else(|_| "./logs".to_string());
        if let Err(err) = std::fs::create_dir_all(&log_dir) {
            eprintln!("failed to create log directory {log_dir}: {err}");
        } else {
            let file_appender = RollingFileAppender::new(Rotation::DAILY, &log_dir, "backend.log");
            let (file_writer, guard) = tracing_appender::non_blocking(file_appender);
            let file_layer = fmt::layer()
                .with_writer(file_writer)
                .with_ansi(false)
                .with_target(true);

            tracing_subscriber::registry()
                .with(env_filter)
                .with(stdout_layer)
                .with(file_layer)
                .init();

            return Some(FileLogGuard { _guard: guard });
        }
    }

    tracing_subscriber::registry()
        .with(env_filter)
        .with(stdout_layer)
        .init();

    None
}
