-- Algorithm performance tracking for dynamic weight learning
CREATE TABLE IF NOT EXISTS "algorithm_performance" (
    "userId" TEXT NOT NULL,
    "algorithmId" TEXT NOT NULL,
    "emaReward" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "sampleCount" BIGINT NOT NULL DEFAULT 0,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.33,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("userId", "algorithmId")
);

CREATE INDEX IF NOT EXISTS "idx_algorithm_performance_userId"
    ON "algorithm_performance"("userId");
