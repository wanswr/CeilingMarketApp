-- CreateIndex
CREATE UNIQUE INDEX "AssistantReminder_userId_idempotencyKey_key" ON "AssistantReminder"("userId", "idempotencyKey");
