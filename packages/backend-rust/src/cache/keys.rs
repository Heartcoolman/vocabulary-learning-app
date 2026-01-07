use std::time::Duration;

pub const SESSION_TTL: Duration = Duration::from_secs(10 * 60);
pub const USER_PROFILE_TTL: Duration = Duration::from_secs(30 * 60);
pub const WORD_TTL: Duration = Duration::from_secs(60 * 60);
pub const WORDBOOK_SYSTEM_LIST_TTL: Duration = Duration::from_secs(30 * 60);
pub const AMAS_CONFIG_TTL: Duration = Duration::from_secs(5 * 60);

pub fn session_key(token_hash: &str) -> String {
    format!("session:{}", token_hash)
}

pub fn user_profile_key(user_id: &str) -> String {
    format!("user:{}:profile", user_id)
}

pub fn word_key(word_id: &str) -> String {
    format!("word:{}", word_id)
}

pub fn wordbook_system_list_key() -> &'static str {
    "wordbook:system:list"
}

pub fn amas_config_key() -> &'static str {
    "amas:config"
}
