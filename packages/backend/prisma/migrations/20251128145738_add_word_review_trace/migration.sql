-- CreateTable
CREATE TABLE "word_review_traces" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "responseTime" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "word_review_traces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "word_review_traces_userId_wordId_idx" ON "word_review_traces"("userId", "wordId");

-- CreateIndex
CREATE INDEX "word_review_traces_userId_wordId_timestamp_idx" ON "word_review_traces"("userId", "wordId", "timestamp");

-- AddForeignKey
ALTER TABLE "word_review_traces" ADD CONSTRAINT "word_review_traces_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_review_traces" ADD CONSTRAINT "word_review_traces_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
