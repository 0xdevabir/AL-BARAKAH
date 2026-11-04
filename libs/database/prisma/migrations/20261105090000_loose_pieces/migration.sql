-- Loose tablet/capsule sales: customers can buy a few pieces instead of a whole pack.
CREATE TYPE "SaleUnit" AS ENUM ('PACK', 'PIECE');
ALTER TABLE "OrderItem" ADD COLUMN "unit" "SaleUnit" NOT NULL DEFAULT 'PACK';
ALTER TABLE "Batch" ADD COLUMN "looseQty" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderAllocation" ADD COLUMN "loose" BOOLEAN NOT NULL DEFAULT false;
