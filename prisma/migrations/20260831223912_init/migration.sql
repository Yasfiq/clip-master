-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "sourceUrl" TEXT,
    "sourceFilename" TEXT,
    "sourcePath" TEXT,
    "sourceDuration" REAL,
    "sourceFileSize" INTEGER,
    "sourceMetadata" JSONB,
    "progress" REAL NOT NULL DEFAULT 0.0,
    "currentStage" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "stageStartedAt" DATETIME,
    "stageEndedAt" DATETIME,
    "stageProgress" REAL NOT NULL DEFAULT 0.0,
    "stageLogs" JSONB,
    "exportedClipsCount" INTEGER NOT NULL DEFAULT 0,
    "exportedDuration" REAL NOT NULL DEFAULT 0.0,
    "exportPaths" JSONB,
    "configId" TEXT NOT NULL,
    CONSTRAINT "Job_configId_fkey" FOREIGN KEY ("configId") REFERENCES "PipelineConfig" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "stage" TEXT,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "startTime" REAL NOT NULL,
    "endTime" REAL NOT NULL,
    "duration" REAL NOT NULL,
    "viralScore" REAL,
    "confidence" TEXT,
    "fallbackApplied" BOOLEAN NOT NULL DEFAULT false,
    "exportPath" TEXT,
    "thumbnailPath" TEXT,
    "isExported" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Clip_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PipelineConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "adFilterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "adScoreThreshold" REAL NOT NULL DEFAULT 0.75,
    "minSegmentDuration" REAL NOT NULL DEFAULT 120.0,
    "maxSegmentDuration" REAL NOT NULL DEFAULT 300.0,
    "targetDuration" REAL NOT NULL DEFAULT 180.0,
    "mergeThreshold" REAL NOT NULL DEFAULT 120.0,
    "gradingPreset" TEXT NOT NULL DEFAULT 'NATURAL',
    "bgmSourcePath" TEXT,
    "duckThreshold" REAL NOT NULL DEFAULT -24.0,
    "duckRatio" REAL NOT NULL DEFAULT 0.5,
    "duckLevel" REAL NOT NULL DEFAULT 2.0,
    "subtitleEnabled" BOOLEAN NOT NULL DEFAULT true,
    "subtitleLang" TEXT NOT NULL DEFAULT 'id',
    "maxLineLength" INTEGER NOT NULL DEFAULT 42,
    "maxLines" INTEGER NOT NULL DEFAULT 2,
    "minDuration" REAL NOT NULL DEFAULT 1.0,
    "maxDuration" REAL NOT NULL DEFAULT 7.0,
    "videoBitrate" TEXT NOT NULL DEFAULT 'crf=21',
    "audioBitrate" TEXT NOT NULL DEFAULT '192k',
    "targetResolution" TEXT NOT NULL DEFAULT '1920x1080',
    "audioCodec" TEXT NOT NULL DEFAULT 'aac',
    "videoCodec" TEXT NOT NULL DEFAULT 'libx264',
    "h264Preset" TEXT NOT NULL DEFAULT 'medium',
    "keyframeInterval" INTEGER NOT NULL DEFAULT 48,
    "fastStart" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_createdAt_idx" ON "Job"("createdAt");

-- CreateIndex
CREATE INDEX "Job_configId_idx" ON "Job"("configId");

-- CreateIndex
CREATE INDEX "Job_currentStage_idx" ON "Job"("currentStage");

-- CreateIndex
CREATE INDEX "JobLog_jobId_idx" ON "JobLog"("jobId");

-- CreateIndex
CREATE INDEX "JobLog_timestamp_idx" ON "JobLog"("timestamp");

-- CreateIndex
CREATE INDEX "Clip_jobId_idx" ON "Clip"("jobId");

-- CreateIndex
CREATE INDEX "Clip_viralScore_idx" ON "Clip"("viralScore");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineConfig_name_key" ON "PipelineConfig"("name");

-- CreateIndex
CREATE INDEX "PipelineConfig_isDefault_idx" ON "PipelineConfig"("isDefault");
