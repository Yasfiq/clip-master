# Skill: Pipeline Stage Authoring

## Purpose

Standardize how new pipeline stages are created, how they interact with the orchestrator, and how they maintain the job state contract.

---

## 1. Pipeline Architecture

```
PipelineOrchestrator (orchestrator.ts)
  ├── Phase 1: DISCOVER → AD_FILTER → TRANSCRIBE → ANALYZE → CUT
  └── Phase 2: EDIT → SUBTITLE → EXPORT → COMPRESS

Runner (runner.ts)
  └── Executes each PipelineStageHandler sequentially

StageContext (runner-types.ts)
  └── Shared state bag passed through all stages
```

### Key Files

| File                           | Responsibility                                            |
| ------------------------------ | --------------------------------------------------------- |
| `src/pipeline/orchestrator.ts` | Phase sequencing, AbortController, job status transitions |
| `src/pipeline/runner.ts`       | Stage execution loop, progress reporting, error handling  |
| `src/pipeline/runner-types.ts` | `StageContext`, `PipelineStageHandler` interfaces         |
| `src/pipeline/stages/*.ts`     | Individual stage implementations                          |
| `src/pipeline/logic/*.ts`      | Pure decision/transform functions (no side effects)       |
| `src/pipeline/binaries/*.ts`   | External binary wrappers                                  |

---

## 2. Stage Handler Interface

Every stage implements `PipelineStageHandler`:

```typescript
import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';

export class MyStage implements PipelineStageHandler {
  stage = PipelineStage.MY_STAGE;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, logMsg?: string) => Promise<void>,
  ): Promise<void> {
    await onProgress(0.05, 'Starting MY_STAGE');

    // 1. Read from ctx.stageData (populated by previous stages)
    // 2. Do work (call logic/ functions, spawn binaries)
    // 3. Write results to ctx.stageData for next stages
    // 4. Report progress throughout

    await onProgress(1.0, 'MY_STAGE complete');
  }
}
```

---

## 3. StageContext Shape

```typescript
interface StageContext {
  jobId: string;
  sourcePath: string; // Absolute path to original video
  workDir: string; // media/work/<jobId>/
  outputDir: string; // media/exports/
  config: any; // PipelineConfig row
  sourceTitle: string;
  sourceChannel?: string;
  sourceDescription?: string;
  metadata: {
    duration?: number;
    width?: number;
    height?: number;
    format?: string;
    hasAudio?: boolean;
    fps?: number;
    codec?: string;
    audioCodec?: string;
    sampleRate?: number;
    channels?: number;
    bitRate?: number;
    fileSize?: number;
  };
  stageData: {
    adFilter?: { isAd: boolean; score: number; reason: string };
    transcript?: { segments: TranscriptSegment[]; language: string | null; text: string };
    moments?: EnrichedSegment[];
    segments?: Segment[];
    clips?: ClipData[];
  };
}
```

### Data Flow Between Stages

```
DISCOVER   → populates: ctx.sourcePath, ctx.metadata, ctx.sourceTitle
AD_FILTER  → populates: ctx.stageData.adFilter (may terminate job)
TRANSCRIBE → populates: ctx.stageData.transcript
ANALYZE    → populates: ctx.stageData.moments, ctx.stageData.segments
CUT        → populates: ctx.stageData.clips (with cutPath)
EDIT       → updates:   ctx.stageData.clips (adds editedPath)
SUBTITLE   → updates:   ctx.stageData.clips (adds subtitlePath)
EXPORT     → updates:   ctx.stageData.clips (adds exportPath)
COMPRESS   → updates:   ctx.stageData.clips (replaces exportPath with compressed)
```

---

## 4. Rules

### Pure Logic vs Effectful Stage Separation

- **Pure logic** goes in `src/pipeline/logic/`: no filesystem access, no process spawning, no DB writes. Must be unit-testable with mock data only.
- **Effectful work** stays in `src/pipeline/stages/`: file I/O, binary spawning, DB updates via onProgress.

```
logic/analyze.ts     → pure: scoring algorithm, segment selection
stages/analyze.ts    → effectful: calls Ollama, writes stageData

logic/colorGrade.ts  → pure: returns filter string
stages/edit.ts       → effectful: runs ffmpeg with filter
```

### Progress Reporting

- Report progress as `0.0–1.0` float.
- Always start with `onProgress(0.05, 'Starting <STAGE>')`.
- Always end with `onProgress(1.0, '<STAGE> complete')`.
- For per-clip stages, distribute progress across clips:

```typescript
const clips = ctx.stageData.clips!;
for (let i = 0; i < clips.length; i++) {
  const base = 0.05 + (i / clips.length) * 0.9;
  await onProgress(base, `Processing clip ${i + 1}/${clips.length}`);
  // ... work ...
}
await onProgress(1.0, 'EDIT complete');
```

### Error Handling

- **Recoverable per-clip errors**: catch, set `clip.error`, continue to next clip.
- **Fatal stage errors**: throw — runner catches and transitions job to `FAILED`.
- **Cancellation**: check `signal.aborted` or re-throw `ABORTED` errors immediately.

```typescript
// Per-clip recovery
for (const clip of clips) {
  try {
    await processClip(clip, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ABORTED')) throw err; // never swallow cancellation
    clip.error = msg;
    await onProgress(progress, `Clip ${clip.id} failed: ${msg}`);
  }
}

// Check if ALL clips failed
const successClips = clips.filter((c) => !c.error);
if (successClips.length === 0) {
  throw new Error('All clips failed during EDIT stage');
}
```

### Job Status Transitions

Managed by orchestrator, NOT by stages. Stages only throw or return.

```
PENDING → RUNNING_PHASE1 → (stages execute) → PHASE1_DONE
PHASE1_DONE → RUNNING_PHASE2 → (stages execute) → COMPLETED

Error paths:
Any stage → throw → FAILED (with errorCode + errorMessage)
AD_FILTER → pure ad → REJECTED_AD
ANALYZE → no qualifying segments → FAILED (NO_QUALIFYING_SEGMENTS)
Any → AbortSignal → CANCELLED
```

### DB Writes During Stages

- Stages create/update `Clip` rows in DB for persistence.
- Use `db` singleton from `@/server/db`.
- Log to `JobLog` via `onProgress` callback (runner handles DB write).
- Never update `Job.status` directly — orchestrator owns that.

---

## 5. Registering a New Stage

1. Add enum value to `PipelineStage` in `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name add_<stage>_enum`
3. Create `src/pipeline/stages/<stageName>.ts` implementing `PipelineStageHandler`
4. Create `src/pipeline/logic/<stageName>.ts` for pure logic (if needed)
5. Import and add to stage array in `orchestrator.ts` at correct position
6. Update `runner-types.ts` `StageContext.stageData` if stage produces new data
7. Update ARCHITECTURE.md stage flow

---

## 6. Checklist Before Adding a Stage

- [ ] Implements `PipelineStageHandler` interface
- [ ] Pure logic extracted to `logic/` (unit-testable without media)
- [ ] Progress reported: starts at 0.05, ends at 1.0
- [ ] Per-clip errors caught and recorded, not fatal (unless all fail)
- [ ] Cancellation re-thrown (never swallow `ABORTED`)
- [ ] Binary calls use `runBinaryChecked` with `signal`
- [ ] `stageData` contract documented (what it reads, what it writes)
- [ ] Registered in orchestrator at correct phase position
- [ ] Migration created if new enum value needed
