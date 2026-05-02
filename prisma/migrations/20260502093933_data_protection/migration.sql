-- AlterTable
ALTER TABLE "User" ADD COLUMN     "acceptedPrivacy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "acceptedPrivacyAt" TIMESTAMP(3),
ADD COLUMN     "privacyVersion" TEXT;
