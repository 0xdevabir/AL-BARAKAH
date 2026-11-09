-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN "photoUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN "qualifications" TEXT NOT NULL DEFAULT '',
ADD COLUMN "experienceYears" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "workplace" TEXT NOT NULL DEFAULT '',
ADD COLUMN "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "onboardedAt" TIMESTAMP(3);

-- Doctors added before the setup wizard existed stay listed and bookable.
UPDATE "Doctor" SET "onboardedAt" = "createdAt";

-- CreateTable
CREATE TABLE "DoctorInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bmdcNo" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "feePoisha" INTEGER,
    "channels" "ConsultationChannel"[],
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "doctorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DoctorInvite_tokenHash_key" ON "DoctorInvite"("tokenHash");
CREATE UNIQUE INDEX "DoctorInvite_doctorId_key" ON "DoctorInvite"("doctorId");
CREATE INDEX "DoctorInvite_email_idx" ON "DoctorInvite"("email");
CREATE INDEX "DoctorInvite_bmdcNo_idx" ON "DoctorInvite"("bmdcNo");

-- AddForeignKey
ALTER TABLE "DoctorInvite" ADD CONSTRAINT "DoctorInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DoctorInvite" ADD CONSTRAINT "DoctorInvite_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
