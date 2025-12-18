use chrono::{DateTime, NaiveDateTime, Utc};
use sqlx::types::Json;

#[derive(Debug, Clone)]
pub enum PgBindValue {
    String(Option<String>),
    I32(Option<i32>),
    I64(Option<i64>),
    F64(Option<f64>),
    Bool(Option<bool>),
    DateTime(Option<NaiveDateTime>),
    Json(Option<Json<serde_json::Value>>),
    StringArray(Option<Vec<String>>),
    I32Array(Option<Vec<i32>>),
}

#[derive(Debug, Clone)]
pub enum SqliteBindValue {
    Text(Option<String>),
    Integer(Option<i64>),
    Real(Option<f64>),
    Blob(Option<Vec<u8>>),
}

pub fn sqlite_json_to_pg(value: &serde_json::Value, prisma_type: &str) -> Result<PgBindValue, TypeMapperError> {
    if value.is_null() {
        return Ok(match prisma_type {
            "String" => PgBindValue::String(None),
            "Int" => PgBindValue::I32(None),
            "BigInt" => PgBindValue::I64(None),
            "Float" | "Decimal" => PgBindValue::F64(None),
            "Boolean" => PgBindValue::Bool(None),
            "DateTime" => PgBindValue::DateTime(None),
            "Json" => PgBindValue::Json(None),
            _ if prisma_type.ends_with("[]") => match prisma_type {
                "String[]" => PgBindValue::StringArray(None),
                "Int[]" => PgBindValue::I32Array(None),
                _ => PgBindValue::Json(None),
            },
            _ => PgBindValue::Json(None),
        });
    }

    match prisma_type {
        "String" => Ok(PgBindValue::String(Some(match value {
            serde_json::Value::String(v) => v.clone(),
            other => other.to_string(),
        }))),
        "Int" => Ok(PgBindValue::I32(Some(coerce_i32(value)?))),
        "BigInt" => Ok(PgBindValue::I64(Some(coerce_i64(value)?))),
        "Float" | "Decimal" => Ok(PgBindValue::F64(Some(coerce_f64(value)?))),
        "Boolean" => Ok(PgBindValue::Bool(Some(coerce_bool(value)?))),
        "DateTime" => Ok(PgBindValue::DateTime(Some(coerce_datetime(value)?))),
        "Json" => Ok(PgBindValue::Json(Some(Json(coerce_json(value)?)))),
        "String[]" => Ok(PgBindValue::StringArray(Some(coerce_string_array(value)?))),
        "Int[]" => Ok(PgBindValue::I32Array(Some(coerce_i32_array(value)?))),
        _ => {
            if prisma_type.ends_with("[]") {
                return Ok(PgBindValue::Json(Some(Json(coerce_json(value)?))));
            }
            Ok(PgBindValue::Json(Some(Json(coerce_json(value)?))))
        }
    }
}

pub fn pg_json_to_sqlite(value: &serde_json::Value, prisma_type: &str) -> Result<SqliteBindValue, TypeMapperError> {
    if value.is_null() {
        return Ok(match prisma_type {
            "Int" | "BigInt" => SqliteBindValue::Integer(None),
            "Float" | "Decimal" => SqliteBindValue::Real(None),
            "Boolean" => SqliteBindValue::Integer(None),
            "Bytes" => SqliteBindValue::Blob(None),
            _ => SqliteBindValue::Text(None),
        });
    }

    match prisma_type {
        "Boolean" => Ok(SqliteBindValue::Integer(Some(if coerce_bool(value)? { 1 } else { 0 }))),
        "DateTime" => Ok(SqliteBindValue::Text(Some(match value {
            serde_json::Value::String(v) => normalize_datetime_string(v)?,
            other => normalize_datetime_string(&other.to_string())?,
        }))),
        "Json" => Ok(SqliteBindValue::Text(Some(serde_json::to_string(&coerce_json(value)?)?))),
        "Int" => Ok(SqliteBindValue::Integer(Some(coerce_i64(value)?))),
        "BigInt" => Ok(SqliteBindValue::Integer(Some(coerce_i64(value)?))),
        "Float" | "Decimal" => Ok(SqliteBindValue::Real(Some(coerce_f64(value)?))),
        _ if prisma_type.ends_with("[]") => {
            Ok(SqliteBindValue::Text(Some(serde_json::to_string(&coerce_json(value)?)?)))
        }
        _ => Ok(SqliteBindValue::Text(Some(match value {
            serde_json::Value::String(v) => v.clone(),
            other => other.to_string(),
        }))),
    }
}

fn coerce_bool(value: &serde_json::Value) -> Result<bool, TypeMapperError> {
    match value {
        serde_json::Value::Bool(v) => Ok(*v),
        serde_json::Value::Number(n) => Ok(n.as_i64().unwrap_or(0) != 0),
        serde_json::Value::String(s) => Ok(matches!(s.as_str(), "true" | "1")),
        _ => Err(TypeMapperError::InvalidBoolean(value.clone())),
    }
}

fn coerce_i32(value: &serde_json::Value) -> Result<i32, TypeMapperError> {
    let as_i64 = coerce_i64(value)?;
    i32::try_from(as_i64).map_err(|_| TypeMapperError::OutOfRange(value.clone()))
}

fn coerce_i64(value: &serde_json::Value) -> Result<i64, TypeMapperError> {
    match value {
        serde_json::Value::Number(n) => n
            .as_i64()
            .or_else(|| n.as_u64().and_then(|v| i64::try_from(v).ok()))
            .ok_or_else(|| TypeMapperError::InvalidNumber(value.clone())),
        serde_json::Value::String(s) => s
            .parse::<i64>()
            .map_err(|_| TypeMapperError::InvalidNumber(value.clone())),
        serde_json::Value::Bool(v) => Ok(if *v { 1 } else { 0 }),
        _ => Err(TypeMapperError::InvalidNumber(value.clone())),
    }
}

fn coerce_f64(value: &serde_json::Value) -> Result<f64, TypeMapperError> {
    match value {
        serde_json::Value::Number(n) => n
            .as_f64()
            .ok_or_else(|| TypeMapperError::InvalidNumber(value.clone())),
        serde_json::Value::String(s) => s
            .parse::<f64>()
            .map_err(|_| TypeMapperError::InvalidNumber(value.clone())),
        _ => Err(TypeMapperError::InvalidNumber(value.clone())),
    }
}

fn coerce_datetime(value: &serde_json::Value) -> Result<NaiveDateTime, TypeMapperError> {
    match value {
        serde_json::Value::String(s) => parse_datetime_naive_utc(s)
            .ok_or_else(|| TypeMapperError::InvalidDateTime(value.clone())),
        _ => Err(TypeMapperError::InvalidDateTime(value.clone())),
    }
}

fn normalize_datetime_string(value: &str) -> Result<String, TypeMapperError> {
    parse_datetime_utc(value)
        .map(|dt| dt.to_rfc3339())
        .ok_or_else(|| TypeMapperError::InvalidDateTime(serde_json::Value::String(value.to_string())))
}

fn parse_datetime_utc(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .ok()
        .or_else(|| {
            NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f")
                .ok()
                .or_else(|| NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S").ok())
                .or_else(|| NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.f").ok())
                .or_else(|| NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S").ok())
                .map(|dt| DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc))
        })
}

fn parse_datetime_naive_utc(value: &str) -> Option<NaiveDateTime> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|dt| dt.naive_utc())
        .or_else(|| NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f").ok())
        .or_else(|| NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S").ok())
        .or_else(|| NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.f").ok())
        .or_else(|| NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S").ok())
}

fn coerce_json(value: &serde_json::Value) -> Result<serde_json::Value, TypeMapperError> {
    match value {
        serde_json::Value::String(raw) => match serde_json::from_str::<serde_json::Value>(raw) {
            Ok(parsed) => Ok(parsed),
            Err(_) => Ok(serde_json::Value::String(raw.clone())),
        },
        other => Ok(other.clone()),
    }
}

fn coerce_string_array(value: &serde_json::Value) -> Result<Vec<String>, TypeMapperError> {
    match value {
        serde_json::Value::String(raw) => {
            let parsed: serde_json::Value = serde_json::from_str(raw).unwrap_or(serde_json::Value::Null);
            coerce_string_array(&parsed)
        }
        serde_json::Value::Array(items) => Ok(items
            .iter()
            .map(|item| match item {
                serde_json::Value::String(v) => v.clone(),
                other => other.to_string(),
            })
            .collect()),
        _ => Err(TypeMapperError::InvalidArray(value.clone())),
    }
}

fn coerce_i32_array(value: &serde_json::Value) -> Result<Vec<i32>, TypeMapperError> {
    match value {
        serde_json::Value::String(raw) => {
            let parsed: serde_json::Value = serde_json::from_str(raw).unwrap_or(serde_json::Value::Null);
            coerce_i32_array(&parsed)
        }
        serde_json::Value::Array(items) => items
            .iter()
            .map(coerce_i32)
            .collect::<Result<Vec<_>, _>>(),
        _ => Err(TypeMapperError::InvalidArray(value.clone())),
    }
}

#[derive(Debug, thiserror::Error)]
pub enum TypeMapperError {
    #[error("invalid boolean: {0}")]
    InvalidBoolean(serde_json::Value),
    #[error("invalid number: {0}")]
    InvalidNumber(serde_json::Value),
    #[error("numeric value out of range: {0}")]
    OutOfRange(serde_json::Value),
    #[error("invalid datetime: {0}")]
    InvalidDateTime(serde_json::Value),
    #[error("invalid array: {0}")]
    InvalidArray(serde_json::Value),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}
