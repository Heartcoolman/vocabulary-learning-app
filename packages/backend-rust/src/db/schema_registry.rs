use std::collections::HashMap;

use serde::Deserialize;

const SCHEMA_REGISTRY_JSON: &str = include_str!("../../sql/schema_registry.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SchemaRegistryFile {
    tables: Vec<TableSchema>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSchema {
    pub table_name: String,
    pub model_name: String,
    pub fields: Vec<FieldSchema>,
    pub primary_key: Vec<String>,
    pub unique_keys: Vec<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldSchema {
    pub name: String,
    pub prisma_type: String,
    pub is_array: bool,
    pub is_optional: bool,
    pub has_default: bool,
    pub default_value: Option<serde_json::Value>,
    pub is_updated_at: bool,
}

#[derive(Debug, Clone)]
pub struct SchemaRegistry {
    tables: Vec<TableSchema>,
    by_table: HashMap<String, usize>,
    by_model: HashMap<String, usize>,
}

impl SchemaRegistry {
    pub fn load() -> Result<Self, SchemaRegistryError> {
        let parsed: SchemaRegistryFile =
            serde_json::from_str(SCHEMA_REGISTRY_JSON).map_err(SchemaRegistryError::Parse)?;

        let mut by_table = HashMap::new();
        let mut by_model = HashMap::new();
        for (idx, table) in parsed.tables.iter().enumerate() {
            by_table.insert(table.table_name.clone(), idx);
            by_model.insert(table.model_name.clone(), idx);
        }

        Ok(Self {
            tables: parsed.tables,
            by_table,
            by_model,
        })
    }

    pub fn get_by_table_name(&self, table_name: &str) -> Option<&TableSchema> {
        self.by_table
            .get(table_name)
            .and_then(|idx| self.tables.get(*idx))
    }

    pub fn get_by_model_name(&self, model_name: &str) -> Option<&TableSchema> {
        self.by_model
            .get(model_name)
            .and_then(|idx| self.tables.get(*idx))
    }

    pub fn tables(&self) -> &[TableSchema] {
        &self.tables
    }
}

pub fn is_valid_identifier(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };

    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }

    if name.len() > 63 {
        return false;
    }

    chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

#[derive(Debug, thiserror::Error)]
pub enum SchemaRegistryError {
    #[error("failed to parse schema_registry.json: {0}")]
    Parse(#[source] serde_json::Error),
}

