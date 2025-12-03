#!/bin/sh
set -e

echo "🔄 Syncing database schema..."
npx prisma db push --accept-data-loss || {
  echo "⚠️ db push failed, trying migrate deploy..."
  npx prisma migrate deploy || echo "Migration also failed, continuing anyway..."
}

echo "🚀 Starting application..."
exec "$@"
