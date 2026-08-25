-- CreateEnum
CREATE TYPE "AssistantReminderStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AssistantReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "noteId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "AssistantReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "sourceTaskId" TEXT,
    "sourceDateId" TEXT,
    "notificationId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "AssistantReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantReminder_userId_idx" ON "AssistantReminder"("userId");

-- CreateIndex
CREATE INDEX "AssistantReminder_noteId_idx" ON "AssistantReminder"("noteId");

-- CreateIndex
CREATE INDEX "AssistantReminder_idempotencyKey_idx" ON "AssistantReminder"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "AssistantReminder" ADD CONSTRAINT "AssistantReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantReminder" ADD CONSTRAINT "AssistantReminder_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "AssistantNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
