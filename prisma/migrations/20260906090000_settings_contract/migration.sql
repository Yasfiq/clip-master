-- Settings contract: keep only columns the pipeline reads, drop dead config.
-- colorGrading/backsoundEnabled were read by the pipeline but never persisted
-- as columns; every other dropped column was UI-only illusion (no pipeline read).

-- SQLite: rebuild PipelineConfig with the kept columns.
CREATE TABLE "new_PipelineConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "adFilterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "adScoreThreshold" REAL NOT NULL DEFAULT 0.75,
    "minSegmentDuration" REAL NOT NULL DEFAULT 120.0,
    "targetDuration" REAL NOT NULL DEFAULT 60.0,
    "maxClips" INTEGER NOT NULL DEFAULT 5,
    "colorGrading" TEXT NOT NULL DEFAULT 'natural',
    "backsoundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "subtitleEnabled" BOOLEAN NOT NULL DEFAULT true,
    "targetResolution" TEXT NOT NULL DEFAULT '1080x1920',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_PipelineConfig" (
    "id", "isDefault", "name", "description", "adFilterEnabled", "adScoreThreshold",
    "minSegmentDuration", "targetDuration", "maxClips", "colorGrading",
    "backsoundEnabled", "subtitleEnabled", "targetResolution", "createdAt", "updatedAt"
)
SELECT
    "id", "isDefault", "name", "description", "adFilterEnabled", "adScoreThreshold",
    COALESCE("minSegmentDuration", 120.0), COALESCE("targetDuration", 60.0),
    COALESCE("maxClips", 5), 'natural', true,
    COALESCE("subtitleEnabled", true), COALESCE("targetResolution", '1080x1920'),
    "createdAt", "updatedAt"
FROM "PipelineConfig";
DROP TABLE "PipelineConfig";
ALTER TABLE "new_PipelineConfig" RENAME TO "PipelineConfig";
CREATE UNIQUE INDEX "PipelineConfig_name_key" ON "PipelineConfig"("name");
CREATE INDEX "PipelineConfig_isDefault_idx" ON "PipelineConfig"("isDefault");
