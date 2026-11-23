-- E-medicine: patient health profile, consultation attachments, cancel/reschedule and ratings.
-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "ratedAt" TIMESTAMP(3),
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "rescheduledCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "review" TEXT;

-- CreateTable
CREATE TABLE "PatientProfile" (
    "userId" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "sex" TEXT NOT NULL DEFAULT '',
    "weightKg" DOUBLE PRECISION,
    "bloodGroup" TEXT NOT NULL DEFAULT '',
    "allergies" TEXT NOT NULL DEFAULT '',
    "conditions" TEXT NOT NULL DEFAULT '',
    "medications" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ConsultationFile" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationFile_key_key" ON "ConsultationFile"("key");

-- CreateIndex
CREATE INDEX "ConsultationFile_consultationId_createdAt_idx" ON "ConsultationFile"("consultationId", "createdAt");

-- CreateIndex
CREATE INDEX "Consultation_doctorId_ratedAt_idx" ON "Consultation"("doctorId", "ratedAt");

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationFile" ADD CONSTRAINT "ConsultationFile_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationFile" ADD CONSTRAINT "ConsultationFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_rating_range" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);
