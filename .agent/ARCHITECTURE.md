# Architecture — Clip Master

## Runtime & Core Dependencies

| Dependency              | Version  | Fungsi                               |
| ----------------------- | -------- | ------------------------------------ |
| Node.js                 | ≥22.0.0  | Runtime                              |
| Next.js                 | ^16.3.4  | App framework (App Router)           |
| React / React DOM       | ^19.2.8  | UI                                   |
| Prisma + better-sqlite3 | 7.10.0   | ORM + embedded SQLite DB             |
| Zustand                 | ^5.0.15  | Client state management              |
| Ollama (qwen2.5:7b)     | External | Local LLM (analisis konten)          |
| onnxruntime-node        | ^1.29.0  | Face detection (BlazeFace/MediaPipe) |
| Winston                 | ^3.19.0  | Logging                              |
| Lucide React            | ^1.38.0  | Icon library                         |
| TypeScript              | ^6.0.3   | Language                             |
| Tailwind CSS            | ^4.3.3   | Styling                              |

### External Binaries (non-npm)

- `ffmpeg` / `ffprobe` — video processing & metadata
- `yt-dlp` — YouTube download
- `whisper` — speech-to-text transcription

## Directory Map

```
clip-master/
├── .agent/                  # AI agent context (rules, skills, knowledge)
│   └── SKILLS/core/         # anti-slop, diff-containment, verification-runner
├── prisma/
│   ├── schema.prisma        # DB schema (Job, Clip, JobLog, PipelineConfig)
│   ├── migrations/          # Prisma migrations
│   └── seed.ts              # DB seeding
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── page.tsx         # Dashboard (home)
│   │   ├── clips/page.tsx   # Clip browser page
│   │   ├── settings/        # Settings page
│   │   ├── error.tsx        # Error boundary
│   │   ├── layout.tsx       # Root layout
│   │   └── api/             # API routes (REST)
│   │       ├── jobs/        # CRUD + cancel + phase2 + log stream (SSE)
│   │       ├── clips/       # CRUD + file serve + studio + re-burn + subtitles + tts
│   │       ├── config/      # Pipeline config endpoint
│   │       ├── settings/    # Logo upload
│   │       └── system/      # System status
│   ├── components/          # React UI components (flat, no nesting)
│   │   ├── JobList.tsx      # Job listing
│   │   ├── JobDetail.tsx    # Job detail view
│   │   ├── ClipBrowser.tsx  # Clip browsing
│   │   ├── ClipCard.tsx     # Individual clip card
│   │   ├── ClipStudioModal.tsx  # Clip editor (97KB — largest component)
│   │   ├── SubtitleEditorModal.tsx  # Subtitle editing
│   │   ├── QuickCreate.tsx  # Quick job creation
│   │   ├── SettingsPanel.tsx # Settings UI
│   │   ├── LogViewer.tsx    # Real-time log viewer
│   │   ├── Navigation.tsx   # App navigation
│   │   ├── StatusCards.tsx   # Dashboard status cards
│   │   ├── SystemStatus.tsx # System health widget
│   │   ├── DashboardHeader.tsx
│   │   └── ToastContainer.tsx
│   ├── pipeline/            # Video processing pipeline
│   │   ├── orchestrator.ts  # Pipeline orchestration (stage sequencing)
│   │   ├── runner.ts        # Task runner (job execution engine)
│   │   ├── runner-types.ts  # Runner type definitions
│   │   ├── stages/          # Pipeline stages (sequential)
│   │   │   ├── discover.ts  # Source discovery (YouTube/local)
│   │   │   ├── adFilter.ts  # Ad content detection & filtering
│   │   │   ├── transcribe.ts # Whisper transcription
│   │   │   ├── analyze.ts   # Content analysis (Ollama LLM)
│   │   │   ├── cut.ts       # FFmpeg clip cutting
│   │   │   ├── edit.ts      # Color grading + audio processing
│   │   │   ├── subtitle.ts  # Subtitle burn-in
│   │   │   ├── export.ts    # Final export
│   │   │   ├── compress.ts  # Video compression
│   │   │   └── reBurn.ts    # Studio re-render (re-burn subtitles)
│   │   ├── logic/           # Processing algorithms (23 modules)
│   │   │   ├── faceCrop.ts, kenBurns.ts          # Visual effects
│   │   │   ├── audioDuck.ts, audioBoost.ts, silenceCompress.ts  # Audio
│   │   │   ├── conversationalCaptions.ts, srtLineWrap.ts, srtParser.ts  # Subtitles
│   │   │   ├── hookDetect.ts, momentDetection.ts  # Content intelligence
│   │   │   ├── studioFilterGraph.ts              # FFmpeg filter graph builder
│   │   │   ├── wordChunker.ts, tokenReassembler.ts  # Text processing
│   │   │   ├── adFilter.ts, analyze.ts           # Content analysis logic
│   │   │   ├── colorGrade.ts, subtitleStyle.ts   # Styling
│   │   │   ├── brandingPill.ts, ttsVoiceover.ts  # Branding & TTS
│   │   │   ├── emptyFrameFilter.ts               # QA filter
│   │   │   ├── configPresets.ts, editWiring.ts   # Config & wiring
│   │   │   └── conversationalCaptions.ts         # Animated captions
│   │   ├── ai/
│   │   │   └── momentScorer.ts  # AI moment scoring (ONNX)
│   │   └── binaries/
│   │       ├── faceDetect.ts    # BlazeFace/MediaPipe face detection
│   │       ├── ffprobe.ts       # FFprobe wrapper
│   │       └── spawn.ts        # Child process spawner (ffmpeg/yt-dlp)
│   ├── server/              # Server-side utilities
│   │   ├── db.ts            # Prisma client singleton
│   │   ├── logger.ts        # Winston logger config
│   │   ├── ollama.ts        # Ollama LLM client
│   │   ├── paths.ts         # Media path resolution
│   │   ├── preflight.ts     # Startup checks (binaries, dirs)
│   │   ├── recovery.ts      # Job recovery on restart
│   │   ├── api-utils.ts     # API response helpers
│   │   └── services/
│   │       └── jobService.ts # Job CRUD business logic
│   ├── stores/              # Zustand client stores
│   │   ├── useJobStore.ts   # Job state + polling
│   │   └── useToastStore.ts # Toast notifications
│   └── types/
│       └── clipStudio.ts    # ClipStudio type definitions
├── models/                  # ML model weights
│   ├── blazeface/           # Face detection model
│   └── mediapipe/           # MediaPipe model
├── media/                   # Media file storage (gitignored)
│   ├── sources/             # Downloaded/input videos
│   ├── work/                # Intermediate processing files
│   ├── exports/             # Final exported clips
│   ├── assets/              # Thumbnails, logos
│   ├── incoming/            # Upload landing
│   └── references/          # Reference materials
├── scripts/                 # Dev/test scripts (tsx)
├── tests/                   # Test suites
│   ├── unit/                # Vitest unit tests
│   ├── integration/         # Vitest integration tests
│   ├── e2e/                 # Playwright E2E tests
│   └── fixtures/            # Test fixtures
└── logs/                    # Application logs
```

## Observed Conventions

- **Module aliases**: `@/*` → `./src/*`
- **API pattern**: Next.js App Router `route.ts` files, REST style
- **Naming**: camelCase files, PascalCase components
- **DB**: SQLite embedded, single `dev.db` at project root
- **State**: Zustand stores with polling (no WebSocket, SSE for logs)
- **Pipeline**: Sequential stages orchestrated by `orchestrator.ts`, executed by `runner.ts`
- **Stage flow**: `DISCOVER → AD_FILTER → TRANSCRIBE → ANALYZE → CUT → EDIT → SUBTITLE → EXPORT → COMPRESS`
- **Pre-commit**: Husky + lint-staged (prettier)
- **Testing**: Vitest (unit/integration) + Playwright (E2E)
- **ESM**: `"type": "module"` throughout
- **Strict TypeScript**: enabled
- **Components**: Flat directory, no sub-folders, no barrel exports
