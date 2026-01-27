-- Migration: Add admin authentication tables for isolated admin system

-- admin_users table - completely separate from users table
CREATE TABLE IF NOT EXISTS "admin_users" (
    "id" TEXT PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "permissions" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "admin_users_email_idx" ON "admin_users"("email");

-- admin_sessions table - stores admin session tokens
CREATE TABLE IF NOT EXISTS "admin_sessions" (
    "id" TEXT PRIMARY KEY,
    "adminId" TEXT NOT NULL REFERENCES "admin_users"("id") ON DELETE CASCADE,
    "token" TEXT NOT NULL UNIQUE,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "admin_sessions_token_idx" ON "admin_sessions"("token");
CREATE INDEX IF NOT EXISTS "admin_sessions_adminId_idx" ON "admin_sessions"("adminId");
