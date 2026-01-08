use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use redis::AsyncCommands;
use thiserror::Error;
use tokio::sync::Mutex;

use crate::db::config::FencingConfig;

#[derive(Clone)]
pub struct FencingManager {
    config: FencingConfig,
    client: Option<redis::Client>,
    instance_id: String,
    has_lock: Arc<AtomicBool>,
    fencing_token: Arc<AtomicU64>,
    renew_task: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl FencingManager {
    pub async fn new(config: FencingConfig, redis_url: Option<String>) -> Self {
        let client = if config.enabled {
            redis_url
                .and_then(|url| redis::Client::open(url).ok())
        } else {
            None
        };

        Self {
            config,
            client,
            instance_id: generate_instance_id(),
            has_lock: Arc::new(AtomicBool::new(false)),
            fencing_token: Arc::new(AtomicU64::new(0)),
            renew_task: Arc::new(Mutex::new(None)),
        }
    }

    pub fn enabled(&self) -> bool {
        self.config.enabled
    }

    pub fn has_valid_lock(&self) -> bool {
        self.has_lock.load(Ordering::Relaxed)
    }

    pub fn fencing_token(&self) -> u64 {
        self.fencing_token.load(Ordering::Relaxed)
    }

    pub async fn acquire_lock(&self) -> Result<bool, FencingError> {
        if !self.config.enabled {
            self.has_lock.store(true, Ordering::Relaxed);
            return Ok(true);
        }

        let Some(client) = &self.client else {
            if self.config.fail_on_redis_unavailable {
                return Ok(false);
            }
            self.has_lock.store(true, Ordering::Relaxed);
            return Ok(true);
        };

        let mut conn = client
            .get_multiplexed_tokio_connection()
            .await
            .map_err(FencingError::Redis)?;

        let lock_ttl_ms = duration_ms(self.config.lock_ttl);
        let lock_result: Option<String> = redis::cmd("SET")
            .arg(&self.config.lock_key)
            .arg(&self.instance_id)
            .arg("NX")
            .arg("PX")
            .arg(lock_ttl_ms)
            .query_async(&mut conn)
            .await
            .map_err(FencingError::Redis)?;

        if lock_result.is_none() {
            return Ok(false);
        }

        let token_key = format!("{}:token", self.config.lock_key);
        let token: u64 = conn.incr(token_key, 1u64).await.map_err(FencingError::Redis)?;

        self.fencing_token.store(token, Ordering::Relaxed);
        self.has_lock.store(true, Ordering::Relaxed);

        self.start_renew_loop();

        Ok(true)
    }

    pub async fn release_lock(&self) -> Result<(), FencingError> {
        self.stop_renew_loop().await;

        if !self.config.enabled {
            self.has_lock.store(false, Ordering::Relaxed);
            return Ok(());
        }

        let Some(client) = &self.client else {
            self.has_lock.store(false, Ordering::Relaxed);
            return Ok(());
        };

        let mut conn = client
            .get_multiplexed_tokio_connection()
            .await
            .map_err(FencingError::Redis)?;

        let script = r#"
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        "#;

        let _: i64 = redis::Script::new(script)
            .key(&self.config.lock_key)
            .arg(&self.instance_id)
            .invoke_async(&mut conn)
            .await
            .map_err(FencingError::Redis)?;

        self.has_lock.store(false, Ordering::Relaxed);
        Ok(())
    }

    fn start_renew_loop(&self) {
        let mut guard = self.renew_task.try_lock();
        if let Ok(ref mut slot) = guard {
            if slot.is_some() {
                return;
            }
        }

        let config = self.config.clone();
        let client = self.client.clone();
        let instance_id = self.instance_id.clone();
        let has_lock = Arc::clone(&self.has_lock);
        let renew_task_ref = Arc::clone(&self.renew_task);

        let handle = tokio::spawn(async move {
            if !config.enabled {
                return;
            }
            let Some(client) = client else {
                return;
            };

            let ttl_ms = duration_ms(config.lock_ttl);
            let interval = config.renew_interval;

            loop {
                tokio::time::sleep(interval).await;

                if !has_lock.load(Ordering::Relaxed) {
                    break;
                }

                let mut conn = match client.get_multiplexed_tokio_connection().await {
                    Ok(c) => c,
                    Err(_) => {
                        has_lock.store(false, Ordering::Relaxed);
                        break;
                    }
                };

                let script = r#"
                  if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("pexpire", KEYS[1], ARGV[2])
                  else
                    return 0
                  end
                "#;

                let renewed: i64 = match redis::Script::new(script)
                    .key(&config.lock_key)
                    .arg(&instance_id)
                    .arg(ttl_ms)
                    .invoke_async(&mut conn)
                    .await
                {
                    Ok(v) => v,
                    Err(_) => 0,
                };

                if renewed == 0 {
                    has_lock.store(false, Ordering::Relaxed);
                    break;
                }
            }

            let mut slot = renew_task_ref.lock().await;
            *slot = None;
        });

        if let Ok(mut slot) = self.renew_task.try_lock() {
            *slot = Some(handle);
        }
    }

    async fn stop_renew_loop(&self) {
        let mut slot = self.renew_task.lock().await;
        if let Some(handle) = slot.take() {
            handle.abort();
        }
    }
}

#[derive(Debug, Error)]
pub enum FencingError {
    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),
}

fn duration_ms(value: Duration) -> u64 {
    value.as_millis() as u64
}

fn generate_instance_id() -> String {
    let hostname = std::env::var("HOSTNAME").unwrap_or_else(|_| "localhost".to_string());
    let pid = std::process::id();
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{hostname}-{pid}-{now_ms}")
}
