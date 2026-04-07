-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
