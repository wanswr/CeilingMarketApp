-- AlterTable
ALTER TABLE "Order" ADD COLUMN "frozenFromStatus" "OrderStatus",
ADD COLUMN "frozenAt" TIMESTAMP(3),
ADD COLUMN "frozenReason" TEXT;
