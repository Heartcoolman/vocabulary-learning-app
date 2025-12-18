use std::sync::Arc;
use std::time::Duration;

use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

use super::{EventBus, EventEnvelope, LearningEvent};

const CHANNEL_PREFIX: &str = "learning:events:";
const RECONNECT_DELAY: Duration = Duration::from_secs(5);

pub struct RedisEventBridge {
    event_bus: Arc<EventBus>,
    redis_url: String,
    connection: RwLock<Option<MultiplexedConnection>>,
    running: RwLock<bool>,
}

impl RedisEventBridge {
    pub fn new(event_bus: Arc<EventBus>, redis_url: String) -> Self {
        Self {
            event_bus,
            redis_url,
            connection: RwLock::new(None),
            running: RwLock::new(false),
        }
    }

    async fn get_connection(&self) -> Option<MultiplexedConnection> {
        let conn = self.connection.read().await;
        conn.clone()
    }

    async fn connect(&self) -> Result<MultiplexedConnection, redis::RedisError> {
        let client = redis::Client::open(self.redis_url.as_str())?;
        let conn = client.get_multiplexed_tokio_connection().await?;

        {
            let mut connection = self.connection.write().await;
            *connection = Some(conn.clone());
        }

        info!("Redis event bridge connected");
        Ok(conn)
    }

    pub async fn publish_to_redis(&self, event: &LearningEvent) -> Result<(), RedisEventError> {
        let conn = match self.get_connection().await {
            Some(c) => c,
            None => self.connect().await.map_err(RedisEventError::Connection)?,
        };

        let channel = format!("{}{}", CHANNEL_PREFIX, event.event_type());
        let payload = serde_json::to_string(event).map_err(RedisEventError::Serialization)?;

        let mut conn = conn;
        conn.publish::<_, _, i64>(&channel, &payload)
            .await
            .map_err(RedisEventError::Publish)?;

        debug!(channel = %channel, "Event published to Redis");
        Ok(())
    }

    pub async fn start_subscriber(self: Arc<Self>) {
        {
            let mut running = self.running.write().await;
            if *running {
                warn!("Redis subscriber already running");
                return;
            }
            *running = true;
        }

        info!("Starting Redis event subscriber");

        let bridge = Arc::clone(&self);
        tokio::spawn(async move {
            bridge.subscriber_loop().await;
        });
    }

    async fn subscriber_loop(&self) {
        loop {
            {
                let running = self.running.read().await;
                if !*running {
                    info!("Redis subscriber stopped");
                    break;
                }
            }

            match self.subscribe_and_listen().await {
                Ok(_) => {
                    info!("Redis subscription ended normally");
                }
                Err(e) => {
                    error!(error = %e, "Redis subscription error, reconnecting...");
                    tokio::time::sleep(RECONNECT_DELAY).await;
                }
            }
        }
    }

    async fn subscribe_and_listen(&self) -> Result<(), RedisEventError> {
        let client = redis::Client::open(self.redis_url.as_str())
            .map_err(RedisEventError::Connection)?;

        let mut pubsub = client
            .get_async_pubsub()
            .await
            .map_err(RedisEventError::Connection)?;

        let patterns = vec![
            format!("{}*", CHANNEL_PREFIX),
        ];

        for pattern in &patterns {
            pubsub
                .psubscribe(pattern)
                .await
                .map_err(RedisEventError::Subscribe)?;
            debug!(pattern = %pattern, "Subscribed to Redis pattern");
        }

        info!("Redis event subscriber connected and listening");

        use futures_util::StreamExt;
        let mut stream = pubsub.on_message();

        loop {
            {
                let running = self.running.read().await;
                if !*running {
                    break;
                }
            }

            let msg = match tokio::time::timeout(
                Duration::from_secs(30),
                stream.next(),
            ).await {
                Ok(Some(msg)) => msg,
                Ok(None) => {
                    warn!("Redis subscription stream ended");
                    break;
                }
                Err(_) => continue,
            };

            let channel: String = msg.get_channel_name().to_string();
            let payload: String = match msg.get_payload() {
                Ok(p) => p,
                Err(e) => {
                    warn!(error = %e, "Failed to get message payload");
                    continue;
                }
            };

            debug!(channel = %channel, "Received message from Redis");

            match serde_json::from_str::<LearningEvent>(&payload) {
                Ok(event) => {
                    self.event_bus.publish(event).await;
                }
                Err(e) => {
                    warn!(error = %e, payload = %payload, "Failed to deserialize event");
                }
            }
        }

        Ok(())
    }

    pub async fn stop(&self) {
        let mut running = self.running.write().await;
        *running = false;
        info!("Redis event bridge stopping");
    }

    pub async fn is_connected(&self) -> bool {
        self.connection.read().await.is_some()
    }
}

#[derive(Debug, thiserror::Error)]
pub enum RedisEventError {
    #[error("Redis connection error: {0}")]
    Connection(#[from] redis::RedisError),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Publish error: {0}")]
    Publish(redis::RedisError),

    #[error("Subscribe error: {0}")]
    Subscribe(redis::RedisError),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::AnswerRecordedPayload;
    use chrono::Utc;

    #[tokio::test]
    #[ignore = "requires Redis"]
    async fn test_redis_bridge_publish() {
        let event_bus = Arc::new(EventBus::new());
        let bridge = RedisEventBridge::new(
            Arc::clone(&event_bus),
            "redis://localhost:6379".to_string(),
        );

        let event = LearningEvent::AnswerRecorded(AnswerRecordedPayload {
            user_id: "test_user".to_string(),
            word_id: "test_word".to_string(),
            session_id: None,
            is_correct: true,
            response_time_ms: 1000,
            timestamp: Utc::now(),
        });

        let result = bridge.publish_to_redis(&event).await;
        assert!(result.is_ok());
    }
}
