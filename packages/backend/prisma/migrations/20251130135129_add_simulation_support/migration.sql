-- AlterTable
ALTER TABLE "decision_records" ADD COLUMN     "isSimulation" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "answerRecordId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "decision_records_isSimulation_idx" ON "decision_records"("isSimulation");
