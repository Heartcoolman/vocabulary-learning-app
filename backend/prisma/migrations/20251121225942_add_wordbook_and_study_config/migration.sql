/*
  Warnings:

  - You are about to drop the column `userId` on the `words` table. All the data in the column will be lost.
  - Added the required column `wordBookId` to the `words` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "WordBookType" AS ENUM ('SYSTEM', 'USER');

-- DropForeignKey
ALTER TABLE "words" DROP CONSTRAINT "words_userId_fkey";

-- DropIndex
DROP INDEX "words_userId_idx";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "words" DROP COLUMN "userId",
ADD COLUMN     "wordBookId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "word_books" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "WordBookType" NOT NULL,
    "userId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "coverImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_study_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selectedWordBookIds" TEXT[],
    "dailyWordCount" INTEGER NOT NULL DEFAULT 20,
    "studyMode" TEXT NOT NULL DEFAULT 'sequential',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_study_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "word_books_userId_idx" ON "word_books"("userId");

-- CreateIndex
CREATE INDEX "word_books_type_idx" ON "word_books"("type");

-- CreateIndex
CREATE UNIQUE INDEX "user_study_configs_userId_key" ON "user_study_configs"("userId");

-- CreateIndex
CREATE INDEX "words_wordBookId_idx" ON "words"("wordBookId");

-- AddForeignKey
ALTER TABLE "word_books" ADD CONSTRAINT "word_books_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "words" ADD CONSTRAINT "words_wordBookId_fkey" FOREIGN KEY ("wordBookId") REFERENCES "word_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_study_configs" ADD CONSTRAINT "user_study_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
