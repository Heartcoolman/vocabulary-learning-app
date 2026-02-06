pub const SQLITE_FALLBACK_SCHEMA_SQL: &str = include_str!("../../sql/sqlite_fallback_schema.sql");

pub fn split_sql_statements(sql: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current = String::new();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut prev = '\0';

    for ch in sql.chars() {
        match ch {
            '\'' if !in_double_quote && prev != '\\' => {
                in_single_quote = !in_single_quote;
            }
            '"' if !in_single_quote => {
                in_double_quote = !in_double_quote;
            }
            ';' if !in_single_quote && !in_double_quote => {
                let stmt = current.trim();
                if !stmt.is_empty() {
                    statements.push(stmt.to_string());
                }
                current.clear();
                prev = ch;
                continue;
            }
            _ => {}
        }

        current.push(ch);
        prev = ch;
    }

    let tail = current.trim();
    if !tail.is_empty() {
        statements.push(tail.to_string());
    }

    statements
}
