/*
  Warnings:

  - You are about to drop the column `endTime` on the `ScheduleException` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `ScheduleException` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ScheduleException" DROP COLUMN "endTime",
DROP COLUMN "startTime";

-- CreateTable
CREATE TABLE "ScheduleExceptionBlock" (
    "id" TEXT NOT NULL,
    "exceptionId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "ScheduleExceptionBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleExceptionBlock_exceptionId_idx" ON "ScheduleExceptionBlock"("exceptionId");

-- AddForeignKey
ALTER TABLE "ScheduleExceptionBlock" ADD CONSTRAINT "ScheduleExceptionBlock_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "ScheduleException"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
