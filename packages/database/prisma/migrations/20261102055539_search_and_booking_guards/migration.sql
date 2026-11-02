-- Fuzzy medicine search that tolerates typos, without a separate search service.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Medicine_name_trgm_idx" ON "Medicine" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Medicine_genericName_trgm_idx" ON "Medicine" USING GIN ("genericName" gin_trgm_ops);

-- A doctor's slot can have only one active booking. The database enforces this, so two
-- simultaneous requests can never both win, whatever the application code does.
CREATE UNIQUE INDEX "Consultation_active_slot_key" ON "Consultation" ("doctorId", "startsAt")
  WHERE "status" IN ('HOLD', 'CONFIRMED', 'COMPLETED', 'NO_SHOW');

-- Stock can never go negative, even if a bug skips the application check.
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_qty_non_negative" CHECK ("qtyRemaining" >= 0);
