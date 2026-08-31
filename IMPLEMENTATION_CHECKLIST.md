# Implementation Checklist - Clip Master MVP

**Project:** Long-form → Short-clip Automation Tool  
**Status:** Architecture Complete ✅  
**Date:** 2026-08-31  
**Owner/Operator:** Single-user, localhost only

---

## Phase 1: Foundation Setup

### Database Schema (Prisma)

- [ ] `Job` model with status enum (PENDING, RUNNING, REJECTED_AD, COMPLETED, FAILED, CANCELLED)
- [ ] `Job.stage` enum (DISCOVER, AD_FILTER, ANALYZE, CUT, EDIT, SUBTITLE, EXPORT, COMPRESS)
- [ ] `JobLog` model (jobId, stage, level, message, seq, timestamp)
- [ ] `Clip` model (jobId, index, fileName, path, durationSeconds, sizeBytes, subtitlePath)
- [ ] `PipelineConfig` model (all 50+ parameters from ARCHITECTURE.md)
- [ ] Create migration: `prisma migrate dev --name init`
- [ ] Verify SQLite schema created

### Environment Setup

- [ ] Create `.env` from `.env.example`
- [ ] Configure media root paths
- [ ] Set server port (default 3000)
- [ ] Verify yt-dlp, FFmpeg 7.0+, Whisper base model on PATH
- [ ] Create `/media` directory structure:
  - `media/sources/` (downloads)
  - `media/work/` (intermediates)
  - `media/exports/` (outputs)
  - `media/assets/` (backsound tracks)

### Node.js & Dependencies

- [ ] Node.js 22.x LTS installed
- [ ] `npm install` completes
- [ ] Next.js 14+, Tailwind CSS, Zustand, Prisma setup
- [ ] Test build: `npm run build` succeeds
- [ ] Test start: `npm run start` binds to 127.0.0.1:3000

---

## Phase 2: Pipeline Agent Implementation

### Pure-Ad Filter (`src/pipeline/stages/adFilter.ts`)

- [ ] Multi-signal scoring implemented (metadata, temporal, visual, audio)
- [ ] Weighted decision logic (fail-safe to accept)
- [ ] Fixture-based unit tests (ad videos, embedded-ad videos, content videos)
- [ ] Test: `npm run test -- adFilter` passes

### Viral Segment Analysis (`src/pipeline/stages/analyze.ts`)

- [ ] Shot change rate detection (FFmpeg `fps` filter)
- [ ] Visual saliency scoring (motion detection)
- [ ] Audio loudness spikes (ffmpeg-normalize analysis)
- [ ] Hook embedding extraction (basic NLP on Whisper transcript)
- [ ] Adaptive thresholding: min=1, max=ceil(duration/3)
- [ ] Confidence scoring (HIGH/MEDIUM/LOW)
- [ ] Unit tests with sample fixture

### Part Cutting Rules (`src/pipeline/stages/cut.ts`)

- [ ] Input: segments array with start/end times
- [ ] Apply min/max bounds (120-300s)
- [ ] Merge remainder < 120s to previous part
- [ ] Output: ordered parts with deterministic names
- [ ] Unit tests: verify determinism (same input = same output)

### Deterministic Naming (`src/pipeline/naming.ts`)

- [ ] Format: `{sourceId}_{index:02d}_{preset}_{resolution}.mp4`
- [ ] Sanitize source titles (no traversal, no spaces)
- [ ] Unit tests: verify consistency

### Edit Stage (`src/pipeline/stages/edit.ts`)

- [ ] Color grading: apply 5 FFmpeg filter presets
- [ ] Backsound mixing: -3dB source, -18dB backsound, -24dB ducked
- [ ] Voice detection: FFmpeg silencedetect + Whisper overlap check
- [ ] Ducking transitions: 0.5s crossfade
- [ ] Fade in/out: 2s at part boundaries
- [ ] Generate intermediate MP4 with audio mix

### Subtitle Stage (`src/pipeline/stages/subtitle.ts`)

- [ ] Per-part Whisper transcription (base model)
- [ ] Output SRT files (not burn-in)
- [ ] Error handling: retry once on failure
- [ ] Integrate SRT into clip metadata

### Export Stage (`src/pipeline/stages/export.ts`)

- [ ] H.264 encoding: libx264, preset=medium, crf=21
- [ ] Resolution: native capped at 1080p (downscale 4K if needed)
- [ ] Container: MP4 with faststart
- [ ] Audio: AAC 192k, 48kHz
- [ ] Output to `media/exports/<jobId>/`

### Compress Stage (`src/pipeline/stages/compress.ts`)

- [ ] High-quality pass (already handled in export with crf=21)
- [ ] Verify file size and bitrate
- [ ] Generate thumbnail frame at 25% duration

### Orchestrator (`src/pipeline/orchestrator.ts`)

- [ ] Stage sequencing logic
- [ ] Child process management (yt-dlp, FFmpeg, Whisper)
- [ ] Process tracking for cancellation
- [ ] JobLog writes per stage
- [ ] Graceful cancellation: SIGTERM → 5s → SIGKILL
- [ ] Retry logic: resume from failed stage

### Binary Wrappers

- [ ] `src/pipeline/binaries/ytdlp.ts` — argument array construction, validation
- [ ] `src/pipeline/binaries/ffmpeg.ts` — filter chain builders, process wrapper
- [ ] `src/pipeline/binaries/whisper.ts` — transcription wrapper, error handling

---

## Phase 3: Web UI Agent Implementation

### API Routes

- [ ] `POST /api/jobs` — create job from URL
- [ ] `GET /api/jobs` — list jobs (paginated)
- [ ] `GET /api/jobs/:id` — job detail with clips
- [ ] `DELETE /api/jobs/:id` — delete job
- [ ] `POST /api/jobs/:id/cancel` — graceful stop
- [ ] `POST /api/jobs/:id/retry` — resume from failed stage
- [ ] `GET /api/jobs/:id/logs` — polling fallback (seq cursor)
- [ ] `GET /api/jobs/:id/logs/stream` — SSE stream
- [ ] `GET /api/clips` — clip history
- [ ] `GET /api/clips/:id/file` — stream bytes with range support
- [ ] `GET /api/config` — current pipeline config
- [ ] `PUT /api/config` — update pipeline config
- [ ] Error handling: all codes from ARCHITECTURE.md

### Zustand Stores

- [ ] `src/stores/jobStore.ts`:
  - Job list cache (optimistic updates)
  - SSE connection management
  - Polling fallback (2s running, 10s idle)
  - Log buffer (max 5000 lines)
- [ ] `src/stores/uiStore.ts`:
  - Panel states (job list, detail, settings)
  - Filter state
  - Log autoscroll toggle

### Dashboard Pages

- [ ] `src/app/page.tsx` — job list with status badges
  - Status: PENDING, RUNNING, COMPLETED, FAILED, REJECTED_AD, CANCELLED
  - Created time, source URL, part count
  - Create job input + submit button
  - Pagination/cursor navigation
- [ ] `src/app/jobs/[id]/page.tsx` — job detail
  - Stage timeline (DISCOVER → AD_FILTER → ... → COMPRESS)
  - Real-time log viewer (SSE or polling)
  - Clip cards (thumbnail, title, subtitle status)
  - Action buttons: cancel (if running), retry (if failed), delete
- [ ] `src/app/settings/page.tsx` — pipeline config editor
  - Part duration sliders (min/max/target)
  - Grading preset selector
  - Backsound auto-select toggle
  - Subtitle toggle
  - Save button

### UI Components

- [ ] StatusBadge — color-coded status display
- [ ] LogViewer — scrollable log with line numbers, SSE updates
- [ ] ClipCard — clip preview with metadata, download link
- [ ] ProgressBar — stage progress indicator
- [ ] JobForm — source URL input validation

### Styling (Tailwind)

- [ ] Responsive layout (mobile/tablet/desktop)
- [ ] Dark mode support (default light, toggle in nav)
- [ ] PWA manifest + service worker for installable shell

---

## Phase 4: QA Agent Implementation

### Unit Tests (`tests/unit/`)

- [ ] `adFilter.test.ts` — acceptance/rejection fixtures
  - Pure ads (short duration, keyword match, no hook)
  - Embedded-ad videos (long duration, story + ads)
  - Content videos (proper story progression)
- [ ] `analyze.test.ts` — segment scoring consistency
  - Determinism (same input = same scores)
  - Threshold edge cases
  - Fallback behavior
- [ ] `cut.test.ts` — cutting rules
  - Min/max bounds enforcement
  - Merge threshold logic
  - Ordering determinism
- [ ] `naming.test.ts` — filename consistency
  - Sanitization (no path traversal)
  - Determinism (same inputs = same names)

### Smoke Test (`tests/e2e/pipeline.smoke.test.ts`)

- [ ] Full pipeline on `tests/fixtures/sample.mp4`
- [ ] Expected output: 2-3 clips, all COMPLETED
- [ ] Verify artifacts exist on disk
- [ ] Verify database records created
- [ ] Run: `npm run test:smoke`

### Pre-commit Hooks (husky + lint-staged)

- [ ] `.husky/pre-commit` — run lint + affected tests
- [ ] `lint-staged` config for staged files only
- [ ] Test gate passes before commit

### Manual QA Checklist (documented)

- [ ] Dashboard loads at localhost:3000
- [ ] Create job: form validates URL
- [ ] Job submission: appears in list as PENDING
- [ ] Job running: stage timeline updates in real-time
- [ ] Log viewer: SSE updates appear live
- [ ] Clip preview: plays in browser
- [ ] Settings page: config changes persist
- [ ] Cancellation: running job stops gracefully
- [ ] Retry: failed job resumes from that stage
- [ ] Dark mode: toggles successfully
- [ ] PWA: installable on desktop/mobile

---

## Phase 5: Integration & Deployment

### CLI Entry Point (`cli/run.ts`)

- [ ] Thin wrapper around orchestrator
- [ ] Usage: `node cli/run.ts <sourceUrl>`
- [ ] Test with single job

### File Cleanup Service

- [ ] Daily scheduler (node-schedule, 03:00 UTC)
- [ ] Delete `media/sources/*` older than 7 days
- [ ] Delete `media/work/<jobId>/*` on job terminal state
- [ ] Purge JobLog rows for failed jobs > 30 days old
- [ ] Emergency cleanup if < 5GB disk available

### Build & Deploy

- [ ] `npm run build` — Next.js build succeeds
- [ ] `npm run start` — server binds 127.0.0.1:3000
- [ ] Preflight check: binaries exist, media dirs writable
- [ ] Verify Prisma migrations apply cleanly
- [ ] Test with real job end-to-end

### Documentation

- [ ] `.env.example` — all required keys documented
- [ ] `README.md` — installation, usage, troubleshooting
- [ ] `DEPLOYMENT.md` — long-running setup (systemd, launchd)

---

## Blockers & Dependencies

### Hard Requirements

- ✅ Confirm all 15 TBD items resolved (Phase 1 confirmation)
- ✅ Prisma schema finalized
- ✅ FFmpeg 7.0+, yt-dlp, Whisper available on PATH
- ✅ Node.js 22.x LTS
- ✅ AGENTS.md role boundaries clear

### Optional Post-MVP

- [ ] Manual feedback loop (operator scores → tuning weights)
- [ ] Per-job config override
- [ ] H.265 codec option
- [ ] LUT-based color grading
- [ ] Parallel job execution
- [ ] Advanced analytics dashboard

---

## Success Criteria (MVP Release)

1. **Job Creation** — operator submits URL, job created in PENDING state
2. **Pure-Ad Rejection** — pure ads rejected with reason in log
3. **Segment Analysis** — at least 1 segment selected, max bounded by duration/3
4. **Cutting & Parts** — parts generated with correct durations
5. **Editing** — grading, backsound, transitions applied
6. **Subtitles** — SRT files generated, readable
7. **Export** — MP4s created with H.264/CRF 21
8. **Dashboard** — job status visible, logs stream live, clips playable
9. **Error Recovery** — failed job can retry from failed stage
10. **File Retention** — sources cleaned up after 7 days, exports kept forever

---

## Timeline Estimate

| Phase                          | Effort | Days           |
| ------------------------------ | ------ | -------------- |
| Database + Env Setup           | Low    | 1              |
| Pipeline stages (core logic)   | High   | 5-7            |
| Binary wrappers + orchestrator | High   | 4-5            |
| API routes (thin layer)        | Medium | 3-4            |
| Dashboard UI + stores          | Medium | 4-5            |
| Unit tests + smoke test        | Medium | 3-4            |
| Integration + cleanup          | Low    | 2-3            |
| Manual QA + fixes              | Medium | 3-4            |
| **Total MVP**                  | —      | **25-32 days** |

---

**Next Step:** @pipeline-agent begins implementation with Prisma schema and core stage logic.
