-- Each job belongs to the client who submitted it (SCRUM-57)

-- AlterTable: the column starts optional, so the jobs that already exist can be given an owner
ALTER TABLE "Job" ADD COLUMN "clientId" TEXT;

-- Jobs created before this change go to the oldest client account; without clients they are removed
UPDATE "Job" SET "clientId" = (SELECT "id" FROM "User" WHERE "role" = 'CLIENT' ORDER BY "createdAt" LIMIT 1);
DELETE FROM "Job" WHERE "clientId" IS NULL;

-- From now on every job must have an owner
ALTER TABLE "Job" ALTER COLUMN "clientId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Job_clientId_createdAt_idx" ON "Job"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
