use sqlx::Row;
use uuid::Uuid;

use crate::db::DatabaseProxy;

pub async fn seed_desktop_user(proxy: &DatabaseProxy) {
    let pool = proxy.pool();

    let existing: Option<String> =
        sqlx::query(r#"SELECT "id" FROM "users" WHERE "id" = $1"#)
            .bind("1")
            .fetch_optional(pool)
            .await
            .ok()
            .flatten()
            .and_then(|row| row.try_get("id").ok());

    if existing.is_some() {
        tracing::debug!("desktop local user already exists");
        return;
    }

    let password_hash = bcrypt::hash("desktop_local", 4).unwrap_or_default();
    let updated_at = chrono::Utc::now().naive_utc();

    if let Err(err) = sqlx::query(
        r#"
        INSERT INTO "users" ("id", "email", "passwordHash", "username", "role", "updatedAt")
        VALUES ($1, $2, $3, $4, $5::"UserRole", $6)
        "#,
    )
    .bind("1")
    .bind("local@localhost")
    .bind(&password_hash)
    .bind("local_user")
    .bind("USER")
    .bind(updated_at)
    .execute(pool)
    .await
    {
        tracing::warn!(error = %err, "failed to seed desktop local user");
    } else {
        tracing::info!("seeded desktop local user (id=1)");
    }
}

struct TestUser {
    email: &'static str,
    username: &'static str,
    password: &'static str,
    role: &'static str,
}

const TEST_USERS: &[TestUser] = &[
    TestUser {
        email: "test@example.com",
        username: "testuser",
        password: "TestPass123!",
        role: "USER",
    },
    TestUser {
        email: "admin@example.com",
        username: "admin",
        password: "AdminPass123!",
        role: "ADMIN",
    },
];

pub async fn seed_test_users(proxy: &DatabaseProxy) {
    let node_env = std::env::var("NODE_ENV").unwrap_or_default();
    if node_env != "test" {
        return;
    }

    tracing::info!("NODE_ENV=test detected, seeding test users...");

    let pool = proxy.pool();

    for user in TEST_USERS {
        let existing: Option<String> =
            sqlx::query(r#"SELECT "id" FROM "users" WHERE "email" = $1"#)
                .bind(user.email)
                .fetch_optional(pool)
                .await
                .ok()
                .flatten()
                .and_then(|row| row.try_get("id").ok());

        if existing.is_some() {
            tracing::debug!(email = user.email, "test user already exists");
            continue;
        }

        let password_hash = match bcrypt::hash(user.password, 10) {
            Ok(hash) => hash,
            Err(err) => {
                tracing::warn!(error = %err, email = user.email, "failed to hash password");
                continue;
            }
        };

        let user_id = Uuid::new_v4().to_string();
        let updated_at = chrono::Utc::now().naive_utc();

        if let Err(err) = sqlx::query(
            r#"
            INSERT INTO "users" ("id", "email", "passwordHash", "username", "role", "updatedAt")
            VALUES ($1, $2, $3, $4, $5::"UserRole", $6)
            "#,
        )
        .bind(&user_id)
        .bind(user.email)
        .bind(&password_hash)
        .bind(user.username)
        .bind(user.role)
        .bind(updated_at)
        .execute(pool)
        .await
        {
            tracing::warn!(error = %err, email = user.email, "failed to seed test user");
        } else {
            tracing::info!(email = user.email, role = user.role, "seeded test user");
        }
    }
}
