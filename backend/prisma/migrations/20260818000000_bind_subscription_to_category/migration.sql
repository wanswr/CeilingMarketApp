-- AlterTable User: add freeCategoryUsed
ALTER TABLE "User" ADD COLUMN "freeCategoryUsed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Subscription: add categoryId
ALTER TABLE "Subscription" ADD COLUMN "categoryId" TEXT;

-- Populate categoryId for any pre-existing subscriptions using user activeCategoryId or fallback to first Category
UPDATE "Subscription" s
SET "categoryId" = COALESCE(
  (SELECT "activeCategoryId" FROM "User" u WHERE u.id = s."userId" AND u."activeCategoryId" IS NOT NULL),
  (SELECT id FROM "Category" LIMIT 1),
  'uncategorized'
);

-- Make categoryId NOT NULL after data population
ALTER TABLE "Subscription" ALTER COLUMN "categoryId" SET NOT NULL;

-- Drop old unique constraint on userId
DROP INDEX IF EXISTS "Subscription_userId_key";

-- Create composite unique index and category foreign key
CREATE UNIQUE INDEX "Subscription_userId_categoryId_key" ON "Subscription"("userId", "categoryId");
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");
CREATE INDEX "Subscription_categoryId_idx" ON "Subscription"("categoryId");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
