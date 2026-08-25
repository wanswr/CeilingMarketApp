-- AlterTable
ALTER TABLE "AssistantNote" ADD COLUMN "convertedOrderId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AssistantNote_convertedOrderId_key" ON "AssistantNote"("convertedOrderId");

-- AddForeignKey
ALTER TABLE "AssistantNote" ADD CONSTRAINT "AssistantNote_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
