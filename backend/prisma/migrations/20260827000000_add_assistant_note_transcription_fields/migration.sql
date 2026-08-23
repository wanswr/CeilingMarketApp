-- CreateEnum
CREATE TYPE "AssistantNoteTranscriptionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "AssistantNoteAttachment" ADD COLUMN "transcriptionStatus" "AssistantNoteTranscriptionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "transcriptionText" TEXT,
ADD COLUMN "transcriptionError" TEXT;
