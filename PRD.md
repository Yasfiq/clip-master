## Product Vision & Problem Statement

### Problem

Producing short-form clips from long-form video is manual, repetitive, and tool-fragmented: download, scrub for interesting segments, cut, grade, add music, transcribe, burn subtitles, export, compress. Each step lives in a different application. For a single operator producing clips regularly, the bottleneck is not creative judgment — it is the mechanical labor between judgment and output.

### Product

A locally-run, single-user automation tool that executes the full long-form → short-clip pipeline as a job. The primary interface is a local web UI (dashboard status, log, hasil klip) for configuring, launching, and monitoring jobs. CLI is an alternative entry point.

Pipeline (target end-state):

````mermaid
flowchart TD
    A[Video Discovery] --> B{Pure-Ad Filter}
    B -- rejected --> Z[Job Rejected: pure ad]
    B -- accepted --> C[Viral Segment Analysis]
    C --> D[Cut into Multi-Minute Parts]
    D --> E[Basic Editing: color grading, backsound, transitions]
    E --> F[Auto Subtitle]
    F --> G[Export]
    G --> H[Compress High Quality]
    H --> I[(Local Filesystem + SQLite Metadata)]
```### Why it matters
- **Throughput.** One operator triggers a job and reviews output instead of executing seven tool handoffs.
- **Consistency.** Grading presets, part duration rules, and output naming are deterministic and testable.
- **Data locality.** Source video, clips, transcripts, and logs never leave the owner's machine. No telemetry, no third-party transmission.

### Explicit non-goals
Not a SaaS. Not multi-user. No hosted deployment, no account system, no team collaboration at this stage.

---

## Target Users

Single role: **Owner/Operator**, with full access to every function — discovery, starting and stopping jobs, editing pipeline configuration, reading logs, viewing output clips. No login system, no permission tiers, no role matrix. The web server binds to `127.0.0.1` only.

### Persona — Owner/Operator

| Attribute | Detail |
|---|---|
| Context | Runs the tool on their own machine (localhost only) |
| Technical level | Comfortable with a terminal, `.env` files, and file paths |
| Primary jobs-to-be-done | Paste a source link → get multiple export-ready subtitled clips |
| Interaction pattern | Launch job → leave it running → return to inspect dashboard status, log, and hasil klip |
| Failure tolerance | Tolerates a failed job if the log explains where and why it failed |
| Access surface | Local web UI (primary), CLI (secondary) |

There is no secondary user persona. Any requirement implying a second actor is out of scope.

---

## Core Features (MVP Scope)

### 1. Manual Link Ingestion with Pure-Ad Rejection

**Description.** Operator submits a source video URL. The system downloads the video and evaluates whether the content is a pure advertisement. Pure-ad videos are rejected before any processing cost is incurred. Videos containing embedded/mid-roll ad segments (iklan sisipan) remain eligible — the filter targets the video as a whole, not ad segments inside it.

**User story.** As the Owner/Operator, I want to submit a video link and have pure-ad content rejected automatically, so that I never spend processing time on material that cannot produce usable clips.

**Acceptance criteria.**
- Web UI exposes a single-URL input and a submit action that creates a job record in SQLite via Prisma.
- Submitting an invalid or unreachable URL fails the job with a distinct, readable error state in the log — no silent failure, no partial artifacts left behind.
- Download is performed by yt-dlp. Downloaded source file is written to the local filesystem; its path is recorded in the job metadata.
- The pure-ad filter runs before segment analysis. On rejection: job terminates with status `REJECTED_AD`, reason recorded in the log, no clips produced.
- Videos with embedded ad segments are **not** rejected by this filter.
- Filter logic is a pure function with Vitest unit coverage over accept/reject fixtures.
- Rejection thresholds and signals: **TBD — requires user confirmation.**

---

### 2. Viral Segment Analysis and Automatic Part Cutting

**Description.** The accepted source is analyzed to identify segments with viral potential; those segments are cut into parts of several minutes each. Cutting is governed by explicit, testable rules (part duration bounds, boundary handling, output ordering).

**User story.** As the Owner/Operator, I want the tool to find high-potential segments and cut them into multi-minute parts automatically, so that I do not scrub through long-form footage manually.

**Acceptance criteria.**
- Segment selection produces an ordered list of candidate segments with start/end timestamps, persisted to SQLite before cutting begins.
- Cutting rules enforce a configurable target part duration in the "several minutes" range; each emitted part respects the configured bounds. Exact default and min/max: **TBD — requires user confirmation.**
- Cutting is executed by FFmpeg. Each part is written to the local filesystem with a deterministic filename.
- Output naming follows a deterministic scheme covered by Vitese... Vitest unit tests; the same job inputs produce the same filenames.
- Segment selection and cutting rules are unit-tested independently of FFmpeg execution (pure logic separated from process invocation).
- If zero qualifying segments are found, the job ends with an explicit status and log entry rather than an empty success.
- Scoring model / heuristic definition for "viral potential": **TBD — requires user confirmation.**

---

### 3. Basic Editing and Automatic Subtitles

**Description.** Each part receives basic editing — color grading preset, backsound, simple transitions — followed by automatic subtitles generated from a local Whisper transcription.

**User story.** As the Owner/Operator, I want each cut part graded, scored with backsound, and subtitled automatically, so that exported clips need no manual post-processing.

**Acceptance criteria.**
- Color grading is applied from a named preset; preset selection is part of the pipeline configuration editable from the web UI.
- Backsound is mixed into each part. Source audio vs. backsound level policy: **TBD — requires user confirmation.**
- Simple transitions are applied at part boundaries.
- Transcription runs locally via Whisper. No audio or text is sent to any external service.
- Subtitles are rendered onto the output video. Styling parameters (font, size, position, safe-area) and burn-in vs. sidecar decision: **TBD — requires user confirmation.**
- Transcript output is stored on the local filesystem and referenced from the job record.
- Editing and subtitle steps are the responsibility of the Pipeline Agent; there is no separate agent boundary between them.
- Failure in the subtitle step marks the job failed with the step identified in the log; already-completed part artifacts remain on disk for inspection.

---

### 4. Export, High-Quality Compression, and Local Job Dashboard

**Description.** Finished parts are exported and compressed at high quality. The local web UI dashboard shows job status, streaming log output, and the resulting clips.

**User story.** As the Owner/Operator, I want exported and compressed clips plus a dashboard showing status, logs, and results, so that I can monitor a running job and collect finished output in one place.

**Acceptance criteria.**
- Export and compression are executed by FFmpeg; compression targets high visual quality. Codec, container, bitrate/CRF, and resolution ladder: **TBD — requires user confirmation.**
- Dashboard lists all jobs with current status, source URL, created time, and part count, read from SQLite via Prisma.
- Job detail view shows ordered log entries for every pipeline step and the produced clips for that job.
- Operator can start a job and stop a running job from the UI.
- Operator can edit pipeline configuration (grading preset, part duration, backsound selection) from the UI; changes persist.
- All UI ↔ backend communication uses REST over Next.js API routes. No direct filesystem or database access from client components.
- Client state is held in Zustand; server data is fetched through the REST layer.
- Log entries are persisted, not memory-only — a page reload does not lose job history.
- Log/status refresh mechanism (polling interval vs. streaming): **TBD — requires user confirmation.**

---

### Job State Model
```mermaid
flowchart LR
    Q[QUEUED] --> DL[DOWNLOADING]
    DL --> FA[AD_FILTER]
    FA -->|pure ad| RJ[REJECTED_AD]
    FA -->|accepted| AN[ANALYZING]
    AN --> CU[CUTTING]
    CU --> ED[EDITING]
    ED --> SU[SUBTITLING]
    SU --> EX[EXPORTING]
    EX --> CO[COMPRESSING]
    CO --> DN[DONE]
    DL --> ER[FAILED]
    AN --> ER
    CU --> ER
    ED --> ER
    SU --> ER
    EX --> ER
    CO --> ER
    Q --> CA[CANCELLED]
```Exact status enum values are a recommendation, not a confirmed schema. Final enum: **TBD — requires user confirmation.**

### Job Execution Sequence
```mermaid
sequenceDiagram
    participant OP as Owner/Operator
    participant UI as Web UI (Next.js + Zustand)
    participant API as REST API Routes
    participant PIPE as Pipeline Runner
    participant DB as SQLite (Prisma)
    participant FS as Local Filesystem

    OP->>UI: Submit source link
    UI->>API: POST job
    API->>DB: Create job record
    API-->>UI: Job id + status QUEUED
    API->>PIPE: Dispatch job
    PIPE->>FS: Download source (yt-dlp)
    PIPE->>DB: Write log + status
    PIPE->>PIPE: Pure-ad filter
    alt Pure ad
        PIPE->>DB: status REJECTED_AD
    else Accepted
        PIPE->>PIPE: Segment analysis + cut (FFmpeg)
        PIPE->>PIPE: Grading, backsound, transitions
        PIPE->>PIPE: Transcribe (Whisper lokal) + subtitles
        PIPE->>FS: Export + compress outputs
        PIPE->>DB: Register clip paths, status DONE
    end
    OP->>UI: Open dashboard
    UI->>API: GET job status, log, clips
    API->>DB: Query metadata
    API-->>UI: Render status, log, hasil klip
```---

## Non-Functional Requirements

### Performance
- The pipeline is long-running and asynchronous. Job submission must return immediately; no request blocks on FFmpeg or Whisper completion.
- The UI stays responsive while a job runs. Heavy work executes outside the request/response cycle of the dashboard reads.
- Dashboard reads (job list, job detail, log) must not require re-reading video files from disk — all display data comes from SQLite metadata plus clip file paths.
- Concurrency model (single job at a time vs. parallel jobs): **TBD — requires user confirmation.** *Recommendation: serialize jobs in MVP; FFmpeg and Whisper are CPU/GPU-bound and parallel jobs on one machine degrade both.*
- Throughput and latency targets (e.g., minutes of processing per minute of source): **TBD — requires user confirmation.**

### Security
- No authentication system. Single-user local tool by design.
- The web server binds to `127.0.0.1` only, so it is not reachable from the LAN. Binding must not be configurable to `0.0.0.0` in MVP.
- Sensitive configuration lives in a local `.env` file, excluded from version control.
- No telemetry and no third-party data transmission. Source video, clips, transcripts, and logs remain on the owner's machine.
- No API keys, secrets, or credentials in the repository or in log output.
- Because there is no auth layer, any future change that exposes the server beyond localhost is a breaking security change and out of scope.

### Scalability
- Scope is one device, one operator, no server sync. Horizontal scaling, multi-tenancy, and queue infrastructure are non-requirements.
- Storage growth is the real scaling constraint: source downloads plus intermediate parts plus final exports accumulate on local disk. **File retention policy: TBD — requires user confirmation.**
- SQLite is sized for single-writer local access; job/log/clip volume for one operator stays well inside its limits.

### Reliability & Observability
- Every pipeline step writes a persisted log entry with step identity and outcome. Failures identify the failing step.
- Job failure must never leave the dashboard showing a job as running indefinitely with no terminal state.
- Partial artifacts from a failed job remain on disk for diagnosis unless the retention policy (TBD) dictates otherwise.

### Compliance
- Downloaded content is used for personal purposes in accordance with the source platform's ToS.
- No other users' data is stored, so there is no external privacy obligation to satisfy.

### Quality Gates
- Vitest unit tests for core logic: pure-ad filter, viral segment selection, part cutting rules, output file naming.
- One end-to-end smoke test running the full pipeline on a short sample video through to export.
- UI testing is manual — no automated UI test suite in MVP.
- `husky` + `lint-staged` pre-commit hooks enforce checks before commit.

---

## Tech Stack Overview

| Layer | Technology | Rationale |
|---|---|---|
| UI shell | Responsive Web / PWA | Single codebase serving the local dashboard; responsive layout for viewing job status and clips at any window size |
| Framework | Next.js | Serves the UI and hosts the REST API routes in one local process — no separate backend service to run |
| Styling | Tailwind CSS | Utility-first styling keeps dashboard markup and styles co-located; no design-system overhead for a single-operator tool |
| Client state | Zustand | Minimal store for job selection, filters, and UI state; low ceremony compared to a full state framework |
| Transport | REST via Next.js API routes | Explicit request/response boundary between UI and pipeline; keeps filesystem and database access server-side only |
| Metadata store | SQLite via Prisma | Single-file local database for job metadata, logs, and clip history; Prisma provides typed schema and migrations |
| Media storage | Local filesystem | Source video and exported clips as files; database stores paths, not blobs |
| Download | yt-dlp | Source video acquisition from submitted links |
| Media processing | FFmpeg | Cutting, grading, backsound mixing, transitions, subtitle rendering, export, compression |
| Transcription | Whisper (local) | Subtitle generation without sending audio off-machine |
| Testing | Vitest | Unit coverage for core pipeline logic plus the end-to-end smoke test |
| Commit hygiene | husky + lint-staged | Pre-commit gate |

**Integration note.** The Data Flow definition records external integrations (video downloader, subtitle transcription) as not yet finalized, while the agent definitions name yt-dlp and local Whisper. Treat yt-dlp and local Whisper as the intended tools; **specific versions, invocation flags, and Whisper model size are TBD — requires user confirmation.**

**Undecided implementation details.** Log transport (polling vs. streaming), pipeline process supervision, and job cancellation mechanics are **TBD — requires user confirmation.** No additional libraries, services, validation layers, or charting dependencies are approved.

### Architecture
```mermaid
graph LR
    subgraph Owner Machine - localhost only
        UI[Next.js UI: Tailwind + Zustand] --> API[Next.js REST API Routes]
        API --> PR[Pipeline Runner]
        API --> DB[(SQLite via Prisma)]
        PR --> DB
        PR --> YT[yt-dlp]
        PR --> FF[FFmpeg]
        PR --> WH[Whisper lokal]
        YT --> FS[(Local Filesystem)]
        FF --> FS
        WH --> FS
        UI --> CLI_NOTE[CLI: alternative entry point]
    end
```---

## Out of Scope (MVP)

### Deferred to later phases (confirmed roadmap)
- Automatic discovery via channel following (follow channel).
- Trending/viral video discovery.
- Sound effects.
- Visual elements / overlays.
- Advanced video effects.

### Not in this product at any confirmed phase
- Multi-user support, authentication, authorization, roles beyond Owner/Operator.
- SaaS or hosted deployment; exposing the server beyond `127.0.0.1`.
- Server-side sync, cloud storage, remote backup.
- Telemetry, analytics collection, crash reporting to third parties.
- Automated UI test suites (UI testing stays manual).
- Direct publishing or upload to any social platform.
- Mobile or desktop native applications.

### TBD — requires user confirmation
- File retention and cleanup policy for source video, intermediate parts, and exports.
- Parallel job execution.
- Output format matrix (aspect ratios, resolutions, codecs).
- Manual override or editing of auto-selected segments before cutting.
- Subtitle translation or multi-language transcription.

Items in the TBD list are candidates, not commitments. None may be built as MVP scope without confirmation.

---

## Success Metrics

Metrics are scoped to one operator on one machine; there is no analytics pipeline, so measurement is manual or derived from SQLite job records.

### Primary
| Metric | Definition | Target |
|---|---|---|
| Job completion rate | Jobs reaching `DONE` ÷ jobs submitted (excluding correct ad rejections) | TBD — requires user confirmation |
| Manual rework rate | Exported clips usable without further editing ÷ total exported clips | TBD — requires user confirmation |
| Operator time per clip | Wall-clock operator attention from link submission to collecting output | Materially below the manual multi-tool workflow it replaces |

### Secondary
| Metric | Definition |
|---|---|
| Ad-filter precision | Pure-ad videos correctly rejected; videos with embedded ads correctly accepted (no false rejections) |
| Segment usefulness | Share of auto-selected segments the operator judges worth publishing |
| Pipeline failure localization | Share of failed jobs where the log identifies the failing step without additional debugging |
| Subtitle accuracy | Share of clips whose subtitles need no manual correction |
| Test gate health | Vitest unit suite and the end-to-end smoke test pass on every commit |

All numeric targets are unset. Baselines should be captured from the first batch of real jobs before targets are fixed.

---

## Risks & Mitigation

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **"Viral potential" is undefined.** No confirmed scoring model exists, so segment selection may produce segments the operator rejects. | High — undermines the core value of the tool | Isolate selection as a pure, unit-tested function with a swappable heuristic. Capture operator accept/reject judgments per segment to inform tuning. Resolve the scoring definition before implementation starts. |
| 2 | **Ad filter false rejections.** An over-broad filter rejects legitimate videos that merely contain inserted ads. | High — silently drops valid source material | Enforce the accepted/rejected distinction as an explicit Vitest fixture set including embedded-ad cases. Log rejection reasons so every rejection is auditable. Fail toward acceptance when signals are ambiguous. |
| 3 | **Downloader fragility.** Source platforms change and break yt-dlp extraction. | High — pipeline stalls at step one | Keep download isolated behind a single boundary so it can be updated without touching downstream steps. Surface download failures as a distinct job status rather than a generic failure. |
| 4 | **Local resource exhaustion.** FFmpeg and Whisper are CPU/GPU heavy; disk fills with sources, parts, and exports. | High — machine unusable, jobs fail mid-run | Serialize jobs by default (recommendation). Define the retention policy (currently TBD) before regular use. Report disk-related failures explicitly in the log. |
| 5 | **Undecided output specification.** Codec, CRF/bitrate, resolution, and subtitle styling are unconfirmed, but "high quality compress" is a stated requirement. | Medium — rework of export step | Treat export parameters as configuration, not hardcoded values. Block final export implementation on parameter confirmation. |
| 6 | **Long-running work inside a web framework.** Next.js API routes are request-scoped; multi-minute pipelines do not fit request lifetimes. | Medium — jobs die on request timeout, stuck `RUNNING` states | Decide the process supervision model (TBD) before building the runner. Persist status transitions so any crash leaves a recoverable, inspectable record instead of a phantom running job. |
| 7 | **No automated UI coverage.** UI testing is manual by decision. | Medium — dashboard regressions ship unnoticed | Keep business logic out of components so it stays inside Vitest coverage. Maintain a written manual checklist for the dashboard's status, log, and clip views. |
| 8 | **Silent scope creep from deferred features.** Sound effects, visual elements, advanced effects, and channel/trending discovery are adjacent and tempting. | Medium — MVP slips | Keep phase-2 items in Out of Scope. Any addition requires explicit confirmation, not implicit inclusion. |
| 9 | **No auth by design.** Any misconfiguration that binds beyond localhost exposes an unauthenticated control surface capable of executing local processes. | Medium — full local exposure if it happens | Hardcode the `127.0.0.1` bind in MVP. Treat host configurability as out of scope. Keep secrets in the uncommitted local `.env`. |
| 10 | **Source ToS compliance.** Downloading depends on personal-use terms of each source platform. | Low–Medium — usage-policy exposure | Restrict output to personal use as stated. Do not add publishing or distribution features in MVP. |
````
