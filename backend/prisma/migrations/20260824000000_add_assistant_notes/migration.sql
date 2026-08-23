-- CreateEnum
CREATE TYPE "AssistantNoteStatus" AS ENUM ('DRAFT', 'STRUCTURED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssistantNoteRevisionSource" AS ENUM ('TEXT', 'VOICE', 'AI_PATCH', 'MANUAL');

-- CreateTable
CREATE TABLE "AssistantNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rawText" TEXT,
    "structuredData" JSONB,
    "status" "AssistantNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "AssistantNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantNoteRevision" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "source" "AssistantNoteRevisionSource" NOT NULL DEFAULT 'MANUAL',
    "rawInput" TEXT,
    "previousData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantNoteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantNote_userId_idx" ON "AssistantNote"("userId");

-- CreateIndex
CREATE INDEX "AssistantNote_status_idx" ON "AssistantNote"("status");

-- CreateIndex
CREATE INDEX "AssistantNote_createdAt_idx" ON "AssistantNote"("createdAt");

-- CreateIndex
CREATE INDEX "AssistantNoteRevision_noteId_idx" ON "AssistantNoteRevision"("noteId");

-- CreateIndex
CREATE INDEX "AssistantNoteRevision_createdAt_idx" ON "AssistantNoteRevision"("createdAt");

-- AddForeignKey
ALTER TABLE "AssistantNote" ADD CONSTRAINT "AssistantNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantNoteRevision" ADD CONSTRAINT "AssistantNoteRevision_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "AssistantNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
