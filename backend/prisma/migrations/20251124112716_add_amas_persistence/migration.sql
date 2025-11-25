-- CreateTable
CREATE TABLE "amas_user_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attention" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "fatigue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "motivation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "cognitiveProfile" JSONB NOT NULL DEFAULT '{"mem":0.5,"speed":0.5,"stability":0.5}',
    "habitProfile" JSONB,
    "trendState" TEXT,
    "lastUpdateTs" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amas_user_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amas_user_models" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amas_user_models_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "amas_user_states_userId_key" ON "amas_user_states"("userId");

-- CreateIndex
CREATE INDEX "amas_user_states_userId_idx" ON "amas_user_states"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "amas_user_models_userId_key" ON "amas_user_models"("userId");

-- CreateIndex
CREATE INDEX "amas_user_models_userId_idx" ON "amas_user_models"("userId");
