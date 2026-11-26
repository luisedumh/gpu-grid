-- Projects of several files (SCRUM-62): [{ "path": "src/kernels.cu", "content": "..." }]
-- Existing jobs keep their single file in "sourceCode", so the column can be empty.

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "files" JSONB;
