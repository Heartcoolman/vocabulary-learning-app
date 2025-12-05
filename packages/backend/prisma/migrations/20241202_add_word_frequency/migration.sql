-- CreateTable
CREATE TABLE "word_frequency" (
    "word_id" TEXT NOT NULL,
    "frequency_rank" INTEGER NOT NULL,
    "frequency_score" DECIMAL(5,4) NOT NULL,
    "corpus_source" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_frequency_pkey" PRIMARY KEY ("word_id")
);

-- CreateIndex
CREATE INDEX "idx_word_frequency_rank" ON "word_frequency"("frequency_rank");

-- CreateIndex
CREATE INDEX "idx_word_frequency_source" ON "word_frequency"("corpus_source");

-- AddForeignKey
ALTER TABLE "word_frequency" ADD CONSTRAINT "word_frequency_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "words"("id") ON DELETE CASCADE ON UPDATE CASCADE;
