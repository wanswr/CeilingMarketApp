-- AlterTable
ALTER TABLE "Session" ADD COLUMN "deviceFingerprint" TEXT,
                      ADD COLUMN "ipAddress" TEXT;

-- CreateTable
CREATE TABLE "SecurityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT,
    "event" TEXT NOT NULL,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityLog_userId_idx" ON "SecurityLog"("userId");

-- CreateIndex
CREATE INDEX "SecurityLog_phone_idx" ON "SecurityLog"("phone");

-- CreateIndex
CREATE INDEX "SecurityLog_event_idx" ON "SecurityLog"("event");

-- CreateIndex
CREATE INDEX "SecurityLog_createdAt_idx" ON "SecurityLog"("createdAt");
