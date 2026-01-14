#!/bin/bash
set -e

echo "Validating SQL migration files..."

SQL_DIR="$(dirname "$0")/../sql"
ERRORS=0

for sql_file in "$SQL_DIR"/*.sql; do
    filename=$(basename "$sql_file")

    # Skip non-migration files
    if [[ "$filename" == "sqlite_fallback_schema.sql" ]]; then
        continue
    fi

    # Check file naming convention (NNN_description.sql)
    if ! [[ "$filename" =~ ^[0-9]{3}_[a-z_]+\.sql$ ]]; then
        echo "❌ Invalid filename format: $filename (expected: NNN_snake_case.sql)"
        ERRORS=$((ERRORS + 1))
    fi

    # Check for TIMESTAMPTZ (should use TIMESTAMP for NaiveDateTime compatibility)
    if grep -qi "TIMESTAMPTZ" "$sql_file"; then
        echo "❌ $filename: Found TIMESTAMPTZ, use TIMESTAMP for Rust NaiveDateTime compatibility"
        ERRORS=$((ERRORS + 1))
    fi

    # Check for basic SQL syntax issues
    if grep -qE "^\s*$" "$sql_file" && [ ! -s "$sql_file" ]; then
        echo "❌ $filename: Empty file"
        ERRORS=$((ERRORS + 1))
    fi
done

# Check migrate.rs registration consistency
MIGRATE_RS="$(dirname "$0")/../src/db/migrate.rs"
if [ -f "$MIGRATE_RS" ]; then
    echo "Checking migrate.rs registration consistency..."

    for sql_file in "$SQL_DIR"/[0-9]*.sql; do
        filename=$(basename "$sql_file" .sql)
        if ! grep -q "\"$filename\"" "$MIGRATE_RS"; then
            echo "❌ $filename.sql: Not registered in migrate.rs"
            ERRORS=$((ERRORS + 1))
        fi
    done
fi

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "Found $ERRORS validation error(s)"
    exit 1
fi

echo "✅ All migration files validated successfully"
