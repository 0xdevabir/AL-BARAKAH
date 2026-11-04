-- AlterTable
ALTER TABLE "Medicine" ADD COLUMN "reorderLevel" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "handoverCode" TEXT,
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "rating" INTEGER,
ADD COLUMN "feedback" TEXT;

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN "prescription" JSONB;

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
