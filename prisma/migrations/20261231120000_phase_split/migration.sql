-- Phase Split: 2-phase pipeline with pause + review
-- Applied via prisma db execute (AI agent bypass)

-- JobStatus: new enum values (stored as TEXT in SQLite)
-- No table change needed - enum values are validated at application layer

-- Clip: add columns for phase data flow
ALTER TABLE "Clip" ADD COLUMN "cutPath" TEXT;
ALTER TABLE "Clip" ADD COLUMN "editedPath" TEXT;
ALTER TABLE "Clip" ADD COLUMN "subtitlePath" TEXT;
