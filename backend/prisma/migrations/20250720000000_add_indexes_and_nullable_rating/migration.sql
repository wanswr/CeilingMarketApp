-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- AlterTable (User)
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN     "activeCategoryId" TEXT;
ALTER TABLE "User" ALTER COLUMN "rating" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "rating" DROP DEFAULT;

-- AlterTable (Order)
ALTER TABLE "Order" ADD COLUMN     "categoryId" TEXT;

-- CreateIndex (Order indices)
CREATE INDEX "Order_employerId_idx" ON "Order"("employerId");
CREATE INDEX "Order_executorId_idx" ON "Order"("executorId");

-- CreateIndex (Application indices)
CREATE INDEX "Application_executorId_idx" ON "Application"("executorId");

-- CreateIndex (Message indices)
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");

-- AddForeignKey (activeCategoryId fkey)
ALTER TABLE "User" ADD CONSTRAINT "User_activeCategoryId_fkey" FOREIGN KEY ("activeCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (categoryId fkey)
ALTER TABLE "Order" ADD CONSTRAINT "Order_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
