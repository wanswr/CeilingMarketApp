/*
  Warnings:

  - You are about to drop the column `fileUrl` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `ratingAverage` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `ratingCount` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `OrderStatusHistory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "OrderStatusHistory" DROP CONSTRAINT "OrderStatusHistory_orderId_fkey";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "fileUrl",
DROP COLUMN "status",
DROP COLUMN "type";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "ratingAverage",
DROP COLUMN "ratingCount";

-- DropTable
DROP TABLE "OrderStatusHistory";

-- DropEnum
DROP TYPE "MessageStatus";

-- DropEnum
DROP TYPE "MessageType";
