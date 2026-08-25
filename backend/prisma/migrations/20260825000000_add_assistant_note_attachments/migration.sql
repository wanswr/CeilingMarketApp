-- CreateEnum
CREATE TYPE "AssistantNoteAttachmentType" AS ENUM ('AUDIO');

-- CreateTable
CREATE TABLE "AssistantNoteAttachment" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "type" "AssistantNoteAttachmentType" NOT NULL DEFAULT 'AUDIO',
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantNoteAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantNoteAttachment_noteId_idx" ON "AssistantNoteAttachment"("noteId");

-- AddForeignKey
ALTER TABLE "AssistantNoteAttachment" ADD CONSTRAINT "AssistantNoteAttachment_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "AssistantNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
