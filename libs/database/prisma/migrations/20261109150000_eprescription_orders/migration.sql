-- An order can be authorised by the customer's own e-prescription instead of an uploaded photo.
ALTER TABLE "Consultation" ADD COLUMN "prescribedAt" TIMESTAMP(3);
UPDATE "Consultation" SET "prescribedAt" = "updatedAt" WHERE "prescription" IS NOT NULL;
ALTER TABLE "Order" ADD COLUMN "consultationId" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Order_consultationId_idx" ON "Order"("consultationId");
