-- Add studio workspace columns for Job source metadata and Clip hook/studio configuration
ALTER TABLE "Job" ADD COLUMN "sourceTitle" TEXT;
ALTER TABLE "Job" ADD COLUMN "sourceChannel" TEXT;

ALTER TABLE "Clip" ADD COLUMN "hookHeadline" TEXT;
ALTER TABLE "Clip" ADD COLUMN "studioConfig" TEXT;
