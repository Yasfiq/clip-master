# Implementation Plan: 2-Phase Pipeline with Pause + Review

## Overview

Split pipeline into two independent phases with pause state for user review between them.

## Files to Modify

### 1. Prisma Schema

**File:** `prisma/schema.prisma`

Changes:

- Add `RUNNING_PHASE1`, `PHASE1_DONE`, `RUNNING_PHASE2` to `JobStatus` enum
- Add `cutPath`, `editedPath`, `subtitlePath` columns to `Clip` model

### 2. Job Service

**File:** `src/server/services/jobService.ts`

Changes:

- Add `startPhase2(jobId: string, newConfigId?: string)` method
- Add `completePhase1(jobId: string, clips: Clip[])` method
- Update `failJob` to handle new status values

### 3. Pipeline Runner

**File:** `src/pipeline/runner.ts`

Changes:

- Rename `runPipeline` → `runPhase1`
- Add `runPhase2(config: { jobId: string })` function
- Update preflight to run once at Phase 1 start

### 4. Pipeline Orchestrator

**File:** `src/pipeline/orchestrator.ts`

Changes:

- Split `executePipeline` → `executePhase1` + `executePhase2`
- Phase 1 runs: Discover → AdFilter → Transcribe → Analyze → Cut
- Phase 2 runs: Edit → Subtitle → Export → Compress
- Update `stageLogs` persistence after each phase completion

### 5. Stage: Cut

**File:** `src/pipeline/stages/cut.ts`

Changes:

- After cutting all segments, call `db.clip.createMany()` with cutPath, timing, scores
- Remove in-memory clip push to `ctx.stageData.clips`

### 6. Stage: Edit

**File:** `src/pipeline/stages/edit.ts`

Changes:

- After editing each clip, call `db.clip.update({ id: clip.dbId, editedPath })`
- Requires clip.dbId stored from Phase 1

### 7. Stage: Subtitle

**File:** `src/pipeline/stages/subtitle.ts`

Changes:

- After generating SRT, call `db.clip.update({ id: clip.dbId, subtitlePath })`

### 8. Stage: Compress

**File:** `src/pipeline/stages/compress.ts`

Changes:

- Change from `db.clip.create()` to `db.clip.update({ id: clip.dbId, exportPath, isExported, metadata })`

### 9. Stage: Export

**File:** `src/pipeline/stages/export.ts`

Changes:

- Set `clip.exportPath` in memory for Compress to read

### 10. API Route: Phase 2 Trigger

**File:** `src/app/api/jobs/[id]/phase2/route.ts` (NEW)

- POST handler validates job status = PHASE1_DONE
- Accepts optional `configId` for Phase 2 config override
- Returns updated job with clips array

### 11. Recovery Module

**File:** `src/server/recovery.ts`

Changes:

- Handle recovery for `RUNNING_PHASE1` and `RUNNING_PHASE2` states
- Option A: mark FAILED (current behavior)
- Option B: mark PHASE1_DONE (allow resume from Phase 2)

## Implementation Order

1. Schema migration + generate client
2. JobService: add phase1Complete, startPhase2 methods
3. Orchestrator: split executePipeline
4. Runner: add runPhase2, update jobService calls
5. Cut stage: persist clips to DB
6. Edit/Subtitle/Compress stages: update DB instead of in-memory
7. API route: phase2 endpoint
8. Recovery: handle new statuses

## Data Flow

### Phase 1 → Phase 2 Transition

```
1. runPhase1 completes CUT
2. cut.ts calls db.clip.createMany([
     { jobId, startTime, endTime, duration, cutPath, viralScore, confidence }
   ])
3. Status → PHASE1_DONE
4. User reviews clips via GET /api/jobs/[id] (clips in response)
5. User POST /api/jobs/[id]/phase2
6. runPhase2 loads clips from DB → ctx.stageData.clips
7. Each stage updates clip DB rows
8. Final status → COMPLETED
```

## Testing Notes

- Unit test phase1Only job: status transitions correct
- Unit test phase2 trigger: validates PHASE1_DONE state
- Smoke test: full 2-phase run on sample video
- Verify clips appear after Phase 1, update after Phase 2
