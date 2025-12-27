use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};
use tracing::debug;

const CHANNEL_CAPACITY: usize = 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum LearningEvent {
    #[serde(rename = "ANSWER_RECORDED")]
    AnswerRecorded(AnswerRecordedPayload),

    #[serde(rename = "SESSION_STARTED")]
    SessionStarted(SessionStartedPayload),

    #[serde(rename = "SESSION_ENDED")]
    SessionEnded(SessionEndedPayload),

    #[serde(rename = "WORD_MASTERED")]
    WordMastered(WordMasteredPayload),

    #[serde(rename = "FORGETTING_RISK_HIGH")]
    ForgettingRiskHigh(ForgettingRiskPayload),

    #[serde(rename = "STRATEGY_ADJUSTED")]
    StrategyAdjusted(StrategyAdjustedPayload),

    #[serde(rename = "USER_STATE_UPDATED")]
    UserStateUpdated(UserStateUpdatedPayload),

    #[serde(rename = "REWARD_DISTRIBUTED")]
    RewardDistributed(RewardDistributedPayload),
}

impl LearningEvent {
    pub fn event_type(&self) -> &'static str {
        match self {
            LearningEvent::AnswerRecorded(_) => "ANSWER_RECORDED",
            LearningEvent::SessionStarted(_) => "SESSION_STARTED",
            LearningEvent::SessionEnded(_) => "SESSION_ENDED",
            LearningEvent::WordMastered(_) => "WORD_MASTERED",
            LearningEvent::ForgettingRiskHigh(_) => "FORGETTING_RISK_HIGH",
            LearningEvent::StrategyAdjusted(_) => "STRATEGY_ADJUSTED",
            LearningEvent::UserStateUpdated(_) => "USER_STATE_UPDATED",
            LearningEvent::RewardDistributed(_) => "REWARD_DISTRIBUTED",
        }
    }

    pub fn user_id(&self) -> &str {
        match self {
            LearningEvent::AnswerRecorded(p) => &p.user_id,
            LearningEvent::SessionStarted(p) => &p.user_id,
            LearningEvent::SessionEnded(p) => &p.user_id,
            LearningEvent::WordMastered(p) => &p.user_id,
            LearningEvent::ForgettingRiskHigh(p) => &p.user_id,
            LearningEvent::StrategyAdjusted(p) => &p.user_id,
            LearningEvent::UserStateUpdated(p) => &p.user_id,
            LearningEvent::RewardDistributed(p) => &p.user_id,
        }
    }

    pub fn session_id(&self) -> Option<&str> {
        match self {
            LearningEvent::AnswerRecorded(p) => p.session_id.as_deref(),
            LearningEvent::SessionStarted(p) => Some(&p.session_id),
            LearningEvent::SessionEnded(p) => Some(&p.session_id),
            LearningEvent::WordMastered(p) => p.session_id.as_deref(),
            LearningEvent::ForgettingRiskHigh(p) => p.session_id.as_deref(),
            LearningEvent::StrategyAdjusted(p) => p.session_id.as_deref(),
            LearningEvent::UserStateUpdated(p) => p.session_id.as_deref(),
            LearningEvent::RewardDistributed(p) => p.session_id.as_deref(),
        }
    }
}

pub trait EventPayload: Send + Sync {
    fn user_id(&self) -> &str;
    fn session_id(&self) -> Option<&str> {
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnswerRecordedPayload {
    pub user_id: String,
    pub word_id: String,
    pub session_id: Option<String>,
    pub is_correct: bool,
    pub response_time_ms: u64,
    pub timestamp: DateTime<Utc>,
}

impl EventPayload for AnswerRecordedPayload {
    fn user_id(&self) -> &str {
        &self.user_id
    }
    fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStartedPayload {
    pub user_id: String,
    pub session_id: String,
    pub wordbook_id: Option<String>,
    pub planned_count: u32,
    pub timestamp: DateTime<Utc>,
}

impl EventPayload for SessionStartedPayload {
    fn user_id(&self) -> &str {
        &self.user_id
    }
    fn session_id(&self) -> Option<&str> {
        Some(&self.session_id)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionEndedPayload {
    pub user_id: String,
    pub session_id: String,
    pub completed_count: u32,
    pub correct_count: u32,
    pub duration_seconds: u64,
    pub timestamp: DateTime<Utc>,
}

impl EventPayload for SessionEndedPayload {
    fn user_id(&self) -> &str {
        &self.user_id
    }
    fn session_id(&self) -> Option<&str> {
        Some(&self.session_id)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordMasteredPayload {
    pub user_id: String,
    pub word_id: String,
    pub session_id: Option<String>,
    pub mastery_level: f64,
    pub timestamp: DateTime<Utc>,
}

impl EventPayload for WordMasteredPayload {
    fn user_id(&self) -> &str {
        &self.user_id
    }
    fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgettingRiskPayload {
    pub user_id: String,
    pub word_id: String,
    pub session_id: Option<String>,
    pub risk_score: f64,
    pub days_since_review: u32,
    pub timestamp: DateTime<Utc>,
}

impl EventPayload for ForgettingRiskPayload {
    fn user_id(&self) -> &str {
        &self.user_id
    }
    fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyAdjustedPayload {
    pub user_id: String,
    pub session_id: Option<String>,
    pub old_strategy: String,
    pub new_strategy: String,
    pub reason: String,
    pub timestamp: DateTime<Utc>,
}

impl EventPayload for StrategyAdjustedPayload {
    fn user_id(&self) -> &str {
        &self.user_id
    }
    fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserStateUpdatedPayload {
    pub user_id: String,
    pub session_id: Option<String>,
    pub attention_level: Option<f64>,
    pub fatigue_level: Option<f64>,
    pub motivation_level: Option<f64>,
    pub cognitive_load: Option<f64>,
    pub timestamp: DateTime<Utc>,
}

impl EventPayload for UserStateUpdatedPayload {
    fn user_id(&self) -> &str {
        &self.user_id
    }
    fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewardDistributedPayload {
    pub user_id: String,
    pub session_id: Option<String>,
    pub reward_type: String,
    pub reward_value: f64,
    pub context: Option<String>,
    pub timestamp: DateTime<Utc>,
}

impl EventPayload for RewardDistributedPayload {
    fn user_id(&self) -> &str {
        &self.user_id
    }
    fn session_id(&self) -> Option<&str> {
        self.session_id.as_deref()
    }
}

#[derive(Debug, Clone)]
pub struct EventEnvelope {
    pub id: String,
    pub event: LearningEvent,
    pub created_at: DateTime<Utc>,
}

impl EventEnvelope {
    pub fn new(event: LearningEvent) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            event,
            created_at: Utc::now(),
        }
    }
}

type SubscriberId = String;

struct Subscriber {
    user_id: Option<String>,
    session_id: Option<String>,
    event_types: Option<Vec<String>>,
    sender: broadcast::Sender<EventEnvelope>,
}

impl Subscriber {
    fn matches(&self, envelope: &EventEnvelope) -> bool {
        if let Some(ref user_id) = self.user_id {
            if envelope.event.user_id() != user_id {
                return false;
            }
        }

        if let Some(ref session_id) = self.session_id {
            if envelope.event.session_id() != Some(session_id.as_str()) {
                return false;
            }
        }

        if let Some(ref event_types) = self.event_types {
            if !event_types.contains(&envelope.event.event_type().to_string()) {
                return false;
            }
        }

        true
    }
}

pub struct EventBus {
    global_sender: broadcast::Sender<EventEnvelope>,
    subscribers: RwLock<HashMap<SubscriberId, Subscriber>>,
    event_count: RwLock<u64>,
}

impl EventBus {
    pub fn new() -> Self {
        let (global_sender, _) = broadcast::channel(CHANNEL_CAPACITY);
        Self {
            global_sender,
            subscribers: RwLock::new(HashMap::new()),
            event_count: RwLock::new(0),
        }
    }

    pub async fn publish(&self, event: LearningEvent) {
        let envelope = EventEnvelope::new(event);
        let event_type = envelope.event.event_type();
        let user_id = envelope.event.user_id().to_string();

        {
            let mut count = self.event_count.write().await;
            *count += 1;
        }

        let subscribers = self.subscribers.read().await;
        let mut sent_count = 0usize;

        for (_, subscriber) in subscribers.iter() {
            if subscriber.matches(&envelope) {
                match subscriber.sender.send(envelope.clone()) {
                    Ok(_) => sent_count += 1,
                    Err(_) => {}
                }
            }
        }

        if let Err(_) = self.global_sender.send(envelope.clone()) {
            debug!("No global subscribers for event");
        }

        debug!(
            event_type = event_type,
            user_id = user_id,
            sent_to = sent_count,
            "Event published"
        );
    }

    pub fn subscribe_global(&self) -> broadcast::Receiver<EventEnvelope> {
        self.global_sender.subscribe()
    }

    pub async fn subscribe_filtered(
        &self,
        user_id: Option<String>,
        session_id: Option<String>,
        event_types: Option<Vec<String>>,
    ) -> (SubscriberId, broadcast::Receiver<EventEnvelope>) {
        let (sender, receiver) = broadcast::channel(CHANNEL_CAPACITY);
        let subscriber_id = uuid::Uuid::new_v4().to_string();

        let subscriber = Subscriber {
            user_id,
            session_id,
            event_types,
            sender,
        };

        {
            let mut subscribers = self.subscribers.write().await;
            subscribers.insert(subscriber_id.clone(), subscriber);
        }

        debug!(subscriber_id = %subscriber_id, "New filtered subscription created");

        (subscriber_id, receiver)
    }

    pub async fn unsubscribe(&self, subscriber_id: &str) {
        let mut subscribers = self.subscribers.write().await;
        if subscribers.remove(subscriber_id).is_some() {
            debug!(subscriber_id = %subscriber_id, "Subscription removed");
        }
    }

    pub async fn subscriber_count(&self) -> usize {
        let subscribers = self.subscribers.read().await;
        subscribers.len() + self.global_sender.receiver_count()
    }

    pub async fn event_count(&self) -> u64 {
        *self.event_count.read().await
    }

    pub async fn stats(&self) -> EventBusStats {
        EventBusStats {
            total_events: self.event_count().await,
            subscriber_count: self.subscriber_count().await,
            global_subscribers: self.global_sender.receiver_count(),
            filtered_subscribers: self.subscribers.read().await.len(),
        }
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct EventBusStats {
    pub total_events: u64,
    pub subscriber_count: usize,
    pub global_subscribers: usize,
    pub filtered_subscribers: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_event_bus_publish_subscribe() {
        let bus = EventBus::new();
        let mut receiver = bus.subscribe_global();

        let event = LearningEvent::AnswerRecorded(AnswerRecordedPayload {
            user_id: "user1".to_string(),
            word_id: "word1".to_string(),
            session_id: Some("session1".to_string()),
            is_correct: true,
            response_time_ms: 1500,
            timestamp: Utc::now(),
        });

        bus.publish(event).await;

        let envelope = receiver.recv().await.unwrap();
        assert_eq!(envelope.event.event_type(), "ANSWER_RECORDED");
        assert_eq!(envelope.event.user_id(), "user1");
    }

    #[tokio::test]
    async fn test_filtered_subscription() {
        let bus = EventBus::new();
        let (sub_id, mut receiver) = bus
            .subscribe_filtered(
                Some("user1".to_string()),
                None,
                Some(vec!["ANSWER_RECORDED".to_string()]),
            )
            .await;

        let event1 = LearningEvent::AnswerRecorded(AnswerRecordedPayload {
            user_id: "user1".to_string(),
            word_id: "word1".to_string(),
            session_id: None,
            is_correct: true,
            response_time_ms: 1000,
            timestamp: Utc::now(),
        });

        let event2 = LearningEvent::AnswerRecorded(AnswerRecordedPayload {
            user_id: "user2".to_string(),
            word_id: "word2".to_string(),
            session_id: None,
            is_correct: false,
            response_time_ms: 2000,
            timestamp: Utc::now(),
        });

        bus.publish(event1).await;
        bus.publish(event2).await;

        let envelope = receiver.recv().await.unwrap();
        assert_eq!(envelope.event.user_id(), "user1");

        bus.unsubscribe(&sub_id).await;
        assert_eq!(bus.subscribers.read().await.len(), 0);
    }
}
