# ARCHITECTURE.md - Update Summary

**Date:** 2026-08-31  
**Status:** ✅ Complete - All TBD Items Resolved

## What Was Updated

### 1. **Technology Stack Finalized**

- Node.js: **22.x LTS**
- FFmpeg: **7.0+**
- yt-dlp: **Rolling latest** (weekly auto-update)
- Whisper: **`base` model** (5-7% WER, 1.5GB VRAM)
- PWA with **dark mode support** confirmed as MVP

### 2. **Pipeline Configuration Fully Specified**

#### Part Duration

- Min: 120s (2 min)
- Max: 300s (5 min)
- Target: 180s (3 min)
- Boundary: Merge remainder < 2min to previous part

#### Pure-Ad Filter

- Multi-signal detection: metadata, temporal, visual, audio
- Fail-safe toward acceptance (avoid false positives)
- Embedded ads (`iklan sisipan`) explicitly pass through

#### Viral Segment Scoring

- Intrinsic features only (no platform telemetry in MVP)
- Adaptive thresholding: `min=1, max=ceil(duration_min/3)`
- Confidence scoring: HIGH/MEDIUM/LOW flags
- Fallback: top-1 segment if none meet threshold

#### Audio Mixing

- Source: **-3dB**
- Backsound: **-18dB** baseline, **-24dB** when voice detected
- Fade: **2s** in/out, **0.5s** ducking transition
- Auto-select from 4 moods: energetic, calm, dramatic, neutral

#### Subtitles

- Format: **SRT sidecar** (editable, no burn-in)
- Language: **Source auto-detect**
- Execution: **Per-part** transcription
- Error handling: **Retry once**, then fail immediately

#### Export & Compression

- Codec: **H.264** (universal playback)
- Quality: **CRF 21** (excellent, imperceptible loss)
- Preset: **`medium`** (balanced speed/size)
- Resolution: **Native, capped at 1080p** (downscale 4K)
- Container: **MP4** with faststart

#### Color Grading

- **5 fixed presets:** natural, warm-vibrant, cinematic-teal-orange, high-contrast-bw, cool-desaturated
- Implementation: **FFmpeg filter chains** (no LUT files in MVP)

### 3. **API & Transport Layer**

#### New Endpoints

- `POST /api/jobs/:id/retry` — Retry from failed stage
- `GET /api/jobs/:id/logs/stream` — SSE real-time log stream

#### Log Transport

- **Primary:** Server-Sent Events (SSE) for real-time updates
- **Fallback:** REST polling (2s when running, 10s idle)
- **Buffer:** 5000 lines in-memory, overflow fetches from SQLite

#### Error Codes Added

- `NO_QUALIFYING_SEGMENTS` — Zero segments passed threshold

### 4. **File Retention Policy**

| Directory             | Retention                            | Cleanup Trigger |
| --------------------- | ------------------------------------ | --------------- |
| `media/sources/`      | 7 days after job completion          | Daily 03:00 UTC |
| `media/work/<jobId>/` | Delete immediately on terminal state | Job completion  |
| `media/exports/`      | Keep forever                         | Manual only     |
| Failed job logs       | 30 days                              | Daily purge     |

Disk-full trigger: Emergency cleanup if < 5GB available.

### 5. **Concurrency & Job Control**

- **Execution:** Strictly serial (1 active job)
- **Queue:** FIFO, no priority system
- **Cancellation:** Graceful (SIGTERM → 5s → SIGKILL)
- **Retry:** Resume from failed stage, reuse completed parts

### 6. **Configuration Management**

- All parameters stored in `PipelineConfig` table
- Editable via `/api/config` (GET/PUT)
- **No per-job overrides** in MVP (global config only)
- Running jobs use snapshot taken at job start

### 7. **Security & Deployment**

- Bind: **127.0.0.1 only** (localhost)
- Auth: **None** (network isolation is the boundary)
- Process execution: **Argument arrays only**, no shell interpolation
- Log redaction: Strip `.env` values before persisting

## Architecture Sections

```
1. Technology Stack (with confirmed versions)
2. High-Level System Architecture (with concurrency model)
3. Directory & File Structure (with media/assets/)
4. Data Flow (with SSE and retry flows)
5. State Management (with log buffer limits)
6. API Design (with retry endpoint and SSE stream)
7. Security Architecture (with cancellation strategy)
8. Deployment Architecture (with cleanup schedule)
9. Pipeline Configuration Details ⭐ NEW
   - Part Duration & Cutting Rules
   - Pure-Ad Filter Signals
   - Viral Segment Scoring
   - Audio Mixing & Backsound
   - Subtitle Configuration
   - Export & Compression
   - Color Grading Presets
   - Whisper Transcription
   - Error Recovery & Retry
   - Log & Monitoring
   - File Cleanup Schedule
10. Configuration Management ⭐ NEW
    - PipelineConfig Prisma schema
11. Conclusion: MVP Scope Finalized ⭐ NEW
```

## Metrics

- **Total lines:** 882 (expanded from ~429)
- **New sections:** 3 major sections added
- **TBD items resolved:** 15/15 (100%)
- **Configuration parameters specified:** 50+

## Ready for Implementation

All ambiguities resolved. Each agent (Pipeline, Web UI, QA) now has:

- Exact numeric thresholds
- Binary versions
- Error handling strategies
- File retention policies
- API contracts with SSE support
- Prisma schema guidance

**Next step:** Begin Prisma schema implementation, then agent-driven development.
