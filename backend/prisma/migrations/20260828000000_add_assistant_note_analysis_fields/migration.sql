-- CreateEnum
CREATE TYPE "AssistantNoteAnalysisStatus" AS ENUM ('IDLE', 'PROCESSING', 'COMPLETED', 'FAILED', 'STALE');

-- AlterTable
ALTER TABLE "AssistantNote" ADD COLUMN "analysisStatus" "AssistantNoteAnalysisStatus" NOT NULL DEFAULT 'IDLE',
ADD COLUMN "analysisInputHash" TEXT,
ADD COLUMN "analyzedAt" TIMESTAMP(3),
ADD COLUMN "analysisModel" TEXT,
ADD COLUMN "analysisError" TEXT;
