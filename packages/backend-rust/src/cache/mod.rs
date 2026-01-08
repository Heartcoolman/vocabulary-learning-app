pub mod keys;

use std::time::Duration;

use rand::Rng;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serde::de::DeserializeOwned;
use serde::Serialize;

const TTL_JITTER_RATIO: f64 = 0.1;

#[derive(Clone)]
pub struct RedisCache {
    connection: MultiplexedConnection,
}

impl RedisCache {
    pub fn new(connection: MultiplexedConnection) -> Self {
        Self { connection }
    }

    pub async fn connect(redis_url: &str) -> Result<Self, redis::RedisError> {
        let client = redis::Client::open(redis_url)?;
        let connection = client.get_multiplexed_tokio_connection().await?;
        Ok(Self::new(connection))
    }

    pub async fn get<T>(&self, key: &str) -> Option<T>
    where
        T: DeserializeOwned,
    {
        let mut conn = self.connection.clone();
        let payload: Option<String> = conn.get(key).await.ok()?;
        payload.and_then(|p| serde_json::from_str(&p).ok())
    }

    pub async fn mget<T, K>(&self, keys: &[K]) -> Vec<Option<T>>
    where
        T: DeserializeOwned,
        K: AsRef<str>,
    {
        if keys.is_empty() {
            return Vec::new();
        }

        let key_refs: Vec<&str> = keys.iter().map(|key| key.as_ref()).collect();
        let mut conn = self.connection.clone();
        let payloads: Vec<Option<String>> = match conn.mget(&key_refs).await {
            Ok(p) => p,
            Err(_) => return keys.iter().map(|_| None).collect(),
        };

        payloads
            .into_iter()
            .map(|payload| payload.and_then(|p| serde_json::from_str(&p).ok()))
            .collect()
    }

    pub async fn set<T>(&self, key: &str, value: &T, ttl: Duration)
    where
        T: Serialize,
    {
        let payload = match serde_json::to_string(value) {
            Ok(p) => p,
            Err(_) => return,
        };
        let mut conn = self.connection.clone();

        if !ttl.is_zero() {
            let ttl = apply_ttl_jitter(ttl);
            let ttl_secs = ttl.as_secs().max(1) as u64;
            let _: Result<(), _> = conn.set_ex(key, payload, ttl_secs).await;
        } else {
            let _: Result<(), _> = conn.set(key, payload).await;
        }
    }

    pub async fn delete(&self, key: &str) {
        let mut conn = self.connection.clone();
        let _: Result<u64, _> = conn.del(key).await;
    }

    pub async fn is_connected(&self) -> bool {
        let mut conn = self.connection.clone();
        redis::cmd("PING")
            .query_async::<String>(&mut conn)
            .await
            .is_ok()
    }
}

fn apply_ttl_jitter(ttl: Duration) -> Duration {
    let base_ms = ttl.as_millis() as f64;
    let mut rng = rand::rng();
    let factor = rng.random_range(1.0 - TTL_JITTER_RATIO..=1.0 + TTL_JITTER_RATIO);
    let jittered_ms = (base_ms * factor).round().max(1.0);
    Duration::from_millis(jittered_ms as u64)
}
