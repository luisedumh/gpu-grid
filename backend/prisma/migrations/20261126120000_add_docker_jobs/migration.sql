-- SCRUM-24: Docker jobs (image by name or uploaded .tar)

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('CUDA', 'DOCKER');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "archivePath" TEXT,
ADD COLUMN     "command" TEXT,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "imageArchiveName" TEXT,
ADD COLUMN     "kind" "JobKind" NOT NULL DEFAULT 'CUDA';
