-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "learning_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_vectors" (
    "sessionId" TEXT NOT NULL,
    "featureVersion" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "normMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_vectors_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "habit_profiles" (
    "userId" TEXT NOT NULL,
    "timePref" JSONB,
    "rhythmPref" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "habit_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "reward_queue" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "dueTs" TIMESTAMP(3) NOT NULL,
    "reward" DOUBLE PRECISION NOT NULL,
    "status" "RewardStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learning_sessions_userId_startedAt_idx" ON "learning_sessions"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "feature_vectors_featureVersion_createdAt_idx" ON "feature_vectors"("featureVersion", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reward_queue_idempotencyKey_key" ON "reward_queue"("idempotencyKey");

-- CreateIndex
CREATE INDEX "reward_queue_dueTs_status_idx" ON "reward_queue"("dueTs", "status");

-- CreateIndex
CREATE INDEX "reward_queue_userId_idx" ON "reward_queue"("userId");

-- CreateIndex
CREATE INDEX "reward_queue_sessionId_idx" ON "reward_queue"("sessionId");

-- AddForeignKey
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_vectors" ADD CONSTRAINT "feature_vectors_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "learning_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_profiles" ADD CONSTRAINT "habit_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_queue" ADD CONSTRAINT "reward_queue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_queue" ADD CONSTRAINT "reward_queue_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "learning_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
