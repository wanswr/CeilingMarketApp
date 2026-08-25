-- AlterTable
ALTER TABLE "AssistantNoteAttachment" RENAME COLUMN "url" TO "fileUrl";
ALTER TABLE "AssistantNoteAttachment" RENAME COLUMN "size" TO "fileSize";
ALTER TABLE "AssistantNoteAttachment" ADD COLUMN "fileName" TEXT;
