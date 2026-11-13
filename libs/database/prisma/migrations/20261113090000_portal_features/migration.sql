-- Instant intern consultations, doctor and rider accept/reject, rare-medicine sourcing, demand, expenses and an inbox.
CREATE TYPE "DoctorTier" AS ENUM ('SPECIALIST', 'INTERN');
CREATE TYPE "ConsultationKind" AS ENUM ('SCHEDULED', 'INSTANT');
CREATE TYPE "MedicineRequestStatus" AS ENUM ('OPEN', 'SOURCING', 'FULFILLED', 'CLOSED');

ALTER TABLE "Doctor" ADD COLUMN "tier" "DoctorTier" NOT NULL DEFAULT 'SPECIALIST';
ALTER TABLE "DoctorInvite" ADD COLUMN "tier" "DoctorTier" NOT NULL DEFAULT 'SPECIALIST';
ALTER TABLE "Consultation" ADD COLUMN "kind" "ConsultationKind" NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedBy" TEXT[] DEFAULT ARRAY[]::TEXT[];
-- Bookings made before doctors could accept or reject were already agreed to.
UPDATE "Consultation" SET "acceptedAt" = "updatedAt" WHERE status IN ('CONFIRMED', 'COMPLETED', 'NO_SHOW');
CREATE INDEX "Consultation_kind_status_idx" ON "Consultation"("kind", "status");

ALTER TABLE "Medicine" ADD COLUMN "sourcingDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "riderAcceptedAt" TIMESTAMP(3);
UPDATE "Order" SET "riderAcceptedAt" = "updatedAt" WHERE "riderId" IS NOT NULL;

CREATE TABLE "MedicineRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "medicineId" TEXT,
  "name" TEXT NOT NULL,
  "qty" INTEGER NOT NULL DEFAULT 1,
  "note" TEXT,
  "status" "MedicineRequestStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MedicineRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MedicineRequest_status_createdAt_idx" ON "MedicineRequest"("status", "createdAt");
CREATE INDEX "MedicineRequest_medicineId_idx" ON "MedicineRequest"("medicineId");
ALTER TABLE "MedicineRequest" ADD CONSTRAINT "MedicineRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineRequest" ADD CONSTRAINT "MedicineRequest_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amountPoisha" INTEGER NOT NULL,
  "note" TEXT,
  "spentAt" DATE NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Expense_spentAt_idx" ON "Expense"("spentAt");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "link" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
