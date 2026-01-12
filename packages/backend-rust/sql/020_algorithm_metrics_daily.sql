CREATE TABLE IF NOT EXISTS "algorithm_metrics_daily" (
    "algorithmId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "callCount" BIGINT NOT NULL DEFAULT 0,
    "totalLatencyUs" BIGINT NOT NULL DEFAULT 0,
    "errorCount" BIGINT NOT NULL DEFAULT 0,
    "lastCalledAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("algorithmId", "day")
);

CREATE INDEX IF NOT EXISTS "algorithm_metrics_daily_day_idx"
    ON "algorithm_metrics_daily" ("day");
