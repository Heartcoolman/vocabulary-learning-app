use chrono::{DateTime, NaiveDateTime, Utc};
use serde_json::{Map, Value};

use crate::db::config::ConflictStrategy;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConflictWinner {
    Sqlite,
    Postgres,
    Manual,
}

#[derive(Debug, Clone)]
pub struct ConflictRecord {
    pub table_name: String,
    pub row_id: String,
    pub sqlite_data: Map<String, Value>,
    pub postgres_data: Map<String, Value>,
    pub resolution: Option<&'static str>,
    pub resolved_at_ms: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct ConflictResolution {
    pub resolved: bool,
    pub winner: ConflictWinner,
    pub final_data: Map<String, Value>,
    pub conflict_record: Option<ConflictRecord>,
}

#[derive(Debug, Clone)]
pub struct ConflictResolver {
    strategy: ConflictStrategy,
}

impl ConflictResolver {
    pub fn new(strategy: ConflictStrategy) -> Self {
        Self { strategy }
    }

    pub fn strategy(&self) -> ConflictStrategy {
        self.strategy
    }

    pub fn resolve(
        &self,
        table_name: &str,
        row_id: &str,
        sqlite_data: &Map<String, Value>,
        postgres_data: Option<&Map<String, Value>>,
    ) -> ConflictResolution {
        let Some(postgres_data) = postgres_data else {
            return ConflictResolution {
                resolved: true,
                winner: ConflictWinner::Sqlite,
                final_data: sqlite_data.clone(),
                conflict_record: None,
            };
        };

        if !has_conflict(sqlite_data, postgres_data) {
            return ConflictResolution {
                resolved: true,
                winner: ConflictWinner::Sqlite,
                final_data: sqlite_data.clone(),
                conflict_record: None,
            };
        }

        match self.strategy {
            ConflictStrategy::SqliteWins => resolve_sqlite_wins(table_name, row_id, sqlite_data, postgres_data),
            ConflictStrategy::PostgresWins => resolve_postgres_wins(table_name, row_id, sqlite_data, postgres_data),
            ConflictStrategy::VersionBased => resolve_version_based(table_name, row_id, sqlite_data, postgres_data),
            ConflictStrategy::Manual => resolve_manual(table_name, row_id, sqlite_data, postgres_data),
        }
    }
}

fn has_conflict(sqlite_data: &Map<String, Value>, postgres_data: &Map<String, Value>) -> bool {
    let sqlite_version = sqlite_data.get("version").and_then(as_i64);
    let postgres_version = postgres_data.get("version").and_then(as_i64);
    if let (Some(sv), Some(pv)) = (sqlite_version, postgres_version) {
        if sv != pv {
            return true;
        }
    }

    let sqlite_updated_at = sqlite_data.get("updatedAt").and_then(as_datetime_ms);
    let postgres_updated_at = postgres_data.get("updatedAt").and_then(as_datetime_ms);
    if let (Some(su), Some(pu)) = (sqlite_updated_at, postgres_updated_at) {
        if pu > su {
            return true;
        }
    }

    has_data_divergence(sqlite_data, postgres_data)
}

fn has_data_divergence(sqlite_data: &Map<String, Value>, postgres_data: &Map<String, Value>) -> bool {
    for (key, sqlite_value) in sqlite_data.iter() {
        if matches!(key.as_str(), "createdAt" | "updatedAt" | "version") {
            continue;
        }

        let pg_value = postgres_data.get(key);
        if let Some(pg_value) = pg_value {
            if !deep_equal(sqlite_value, pg_value) {
                return true;
            }
        } else if !sqlite_value.is_null() {
            return true;
        }
    }
    false
}

fn resolve_sqlite_wins(
    _table_name: &str,
    _row_id: &str,
    sqlite_data: &Map<String, Value>,
    postgres_data: &Map<String, Value>,
) -> ConflictResolution {
    let mut final_data = sqlite_data.clone();

    if final_data.get("createdAt").is_none() {
        if let Some(created_at) = postgres_data.get("createdAt") {
            final_data.insert("createdAt".to_string(), created_at.clone());
        }
    }

    if let Some(sqlite_version) = final_data.get("version").and_then(as_i64) {
        let postgres_version = postgres_data.get("version").and_then(as_i64).unwrap_or(0);
        let next = sqlite_version.max(postgres_version).saturating_add(1);
        final_data.insert("version".to_string(), Value::Number(next.into()));
    }

    ConflictResolution {
        resolved: true,
        winner: ConflictWinner::Sqlite,
        final_data,
        conflict_record: None,
    }
}

fn resolve_postgres_wins(
    table_name: &str,
    row_id: &str,
    sqlite_data: &Map<String, Value>,
    postgres_data: &Map<String, Value>,
) -> ConflictResolution {
    let record = ConflictRecord {
        table_name: table_name.to_string(),
        row_id: row_id.to_string(),
        sqlite_data: sqlite_data.clone(),
        postgres_data: postgres_data.clone(),
        resolution: Some("postgres_wins"),
        resolved_at_ms: Some(now_ms()),
    };

    ConflictResolution {
        resolved: true,
        winner: ConflictWinner::Postgres,
        final_data: postgres_data.clone(),
        conflict_record: Some(record),
    }
}

fn resolve_version_based(
    table_name: &str,
    row_id: &str,
    sqlite_data: &Map<String, Value>,
    postgres_data: &Map<String, Value>,
) -> ConflictResolution {
    let sqlite_version = sqlite_data.get("version").and_then(as_i64).unwrap_or(0);
    let postgres_version = postgres_data.get("version").and_then(as_i64).unwrap_or(0);

    if sqlite_version >= postgres_version {
        resolve_sqlite_wins(table_name, row_id, sqlite_data, postgres_data)
    } else {
        resolve_postgres_wins(table_name, row_id, sqlite_data, postgres_data)
    }
}

fn resolve_manual(
    table_name: &str,
    row_id: &str,
    sqlite_data: &Map<String, Value>,
    postgres_data: &Map<String, Value>,
) -> ConflictResolution {
    let record = ConflictRecord {
        table_name: table_name.to_string(),
        row_id: row_id.to_string(),
        sqlite_data: sqlite_data.clone(),
        postgres_data: postgres_data.clone(),
        resolution: None,
        resolved_at_ms: None,
    };

    ConflictResolution {
        resolved: false,
        winner: ConflictWinner::Manual,
        final_data: sqlite_data.clone(),
        conflict_record: Some(record),
    }
}

fn as_i64(value: &Value) -> Option<i64> {
    match value {
        Value::Number(n) => n.as_i64().or_else(|| n.as_u64().and_then(|v| i64::try_from(v).ok())),
        Value::String(raw) => raw.parse::<i64>().ok(),
        _ => None,
    }
}

fn as_datetime_ms(value: &Value) -> Option<i64> {
    let raw = match value {
        Value::String(s) => s,
        _ => return None,
    };

    DateTime::parse_from_rfc3339(raw)
        .map(|dt| dt.timestamp_millis())
        .or_else(|_| {
            NaiveDateTime::parse_from_str(raw, "%Y-%m-%d %H:%M:%S")
                .map(|naive| DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc).timestamp_millis())
        })
        .ok()
}

fn deep_equal(a: &Value, b: &Value) -> bool {
    if a == b {
        return true;
    }

    if let (Some(left), Some(right)) = (normalize_scalar(a), normalize_scalar(b)) {
        return left == right;
    }

    match (a, b) {
        (Value::Array(left), Value::Array(right)) => {
            if left.len() != right.len() {
                return false;
            }
            left.iter().zip(right.iter()).all(|(l, r)| deep_equal(l, r))
        }
        (Value::Object(left), Value::Object(right)) => {
            if left.len() != right.len() {
                return false;
            }
            left.iter().all(|(k, v)| match right.get(k) {
                Some(rv) => deep_equal(v, rv),
                None => false,
            })
        }
        _ => false,
    }
}

#[derive(Debug, Clone, PartialEq)]
enum ComparableScalar {
    Bool(bool),
    I64(i64),
    F64(f64),
    DateTimeMs(i64),
    String(String),
}

fn normalize_scalar(value: &Value) -> Option<ComparableScalar> {
    match value {
        Value::Bool(v) => Some(ComparableScalar::Bool(*v)),
        Value::Number(n) => n
            .as_i64()
            .map(ComparableScalar::I64)
            .or_else(|| n.as_f64().map(ComparableScalar::F64)),
        Value::String(s) => {
            if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
                return Some(ComparableScalar::DateTimeMs(dt.timestamp_millis()));
            }
            if let Ok(naive) = NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
                let dt = DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc);
                return Some(ComparableScalar::DateTimeMs(dt.timestamp_millis()));
            }
            if let Ok(number) = s.parse::<i64>() {
                return Some(ComparableScalar::I64(number));
            }
            Some(ComparableScalar::String(s.clone()))
        }
        _ => None,
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
