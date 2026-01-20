/*
  Warnings:

  - Added the required column `validFrom` to the `Shift` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IncidentType" ADD VALUE 'OUT_EARLY';
ALTER TYPE "IncidentType" ADD VALUE 'WRONG_OUT';
ALTER TYPE "IncidentType" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "validFrom" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "validTo" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Shift_weekday_idx" ON "Shift"("weekday");

-- CreateIndex
CREATE INDEX "Shift_validFrom_idx" ON "Shift"("validFrom");

-- CreateIndex
CREATE INDEX "Shift_validTo_idx" ON "Shift"("validTo");
