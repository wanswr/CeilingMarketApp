-- CreateEnum
CREATE TYPE "AssistantNoteEditProposalStatus" AS ENUM ('PENDING', 'APPLIED', 'CANCELLED', 'EXPIRED', 'STALE');

-- AlterTable
ALTER TABLE "AssistantNote" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "AssistantNoteEditProposal" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baseVersion" INTEGER NOT NULL,
    "inputType" TEXT NOT NULL DEFAULT 'TEXT',
    "rawInput" TEXT NOT NULL,
    "operations" JSONB NOT NULL,
    "uncertainties" JSONB,
    "summary" TEXT,
    "status" "AssistantNoteEditProposalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "AssistantNoteEditProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantNoteEditProposal_noteId_idx" ON "AssistantNoteEditProposal"("noteId");

-- CreateIndex
CREATE INDEX "AssistantNoteEditProposal_userId_idx" ON "AssistantNoteEditProposal"("userId");

-- AddForeignKey
ALTER TABLE "AssistantNoteEditProposal" ADD CONSTRAINT "AssistantNoteEditProposal_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "AssistantNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantNoteEditProposal" ADD CONSTRAINT "AssistantNoteEditProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
