-- Add maxClips column to PipelineConfig (schema has it, earlier migrations never created it)
ALTER TABLE "PipelineConfig" ADD COLUMN "maxClips" INTEGER NOT NULL DEFAULT 5;
