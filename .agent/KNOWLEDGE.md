# Knowledge — Clip Master

## 1. Technical Debt & Fragile Areas

- **`ClipStudioModal.tsx` (2098 baris)** — Komponen terbesar, sangat rapuh. Hindari modifikasi besar tanpa breakdown terlebih dahulu. Gunakan ripgrep untuk navigasi, jangan read utuh.
- **`faceCrop.ts` (569 baris)** — Logic face detection + crop complex, melibatkan ONNX + BlazeFace/MediaPipe model weights di `models/`.
- **`studioFilterGraph.ts` (365 baris)** — FFmpeg filter graph builder. Perubahan kecil bisa break seluruh render pipeline. Riwayat fix: color filter format syntax, audio escaping, duplicate overlay stacking.
- **`compress.ts` (530 baris), `reBurn.ts` (551 baris)** — Heavy FFmpeg stage logic, banyak edge case encoding.
- **`edit.ts` stage** — Mengandung TBD: silence removal policy, color grading presets belum exposed di UI.
- **`momentDetection.ts`** — TODO: integrasi Ollama API (qwen + llava) belum diimplementasi.
- **`export.ts`** — Preset dan resolution masih hardcoded (`'default'`, `'1080p'`), TODO extract from config.

## 2. Environment & Local Quirks

- **Port:** `3000` (default), bind `127.0.0.1` only
- **DB:** SQLite file `dev.db` di project root (symlinked dari `prisma/dev.db`)
- **Env vars:** 23 variabel (lihat `.env.example`). Binary paths optional — auto-detect jika tidak di-set.
- **Ollama:** wajib running di `http://127.0.0.1:11434`, model `qwen2.5:7b-instruct-q4_K_M`
- **External binaries:** `ffmpeg`, `ffprobe`, `yt-dlp`, `whisper` harus ada di PATH atau di-set via env
- **ML Models:** `models/blazeface/` dan `models/mediapipe/` — weights harus ada untuk face detection
- **Media dirs:** `media/{sources,work,exports,assets,incoming,references}` — auto-created by preflight
- **Seed:** `npx prisma db seed` (via `tsx prisma/seed.ts`) — creates default PipelineConfig
- **Pre-commit:** `npx lint-staged` (prettier only, no test run)
- **SSE:** Log streaming via `GET /api/jobs/:id/logs/stream` — reconnect backoff configurable via `SSE_RECONNECT_BACKOFF_MS`

## 3. Business Logic Glossary

| Istilah                     | Arti                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| **Iklan sisipan**           | Embedded/mid-roll ad dalam video. Video yang _mengandung_ iklan sisipan tetap diterima pipeline. |
| **Pure ad**                 | Video yang seluruhnya iklan. Ditolak pipeline → status `REJECTED_AD`.                            |
| **Ad score threshold**      | Skor 0–1. Default 0.75. Di atas threshold = reject sebagai pure ad.                              |
| **Viral score**             | Skor 0–1 potensi viralitas clip. Threshold kalibrasi terakhir: 0.38.                             |
| **Hook headline**           | 3–5 word uppercase hook text di awal clip.                                                       |
| **Phase 1**                 | Pipeline stages: DISCOVER → AD_FILTER → TRANSCRIBE → ANALYZE → CUT                               |
| **Phase 2**                 | Pipeline stages: EDIT → SUBTITLE → EXPORT → COMPRESS                                             |
| **Re-burn**                 | Re-render clip dari studio config (subtitle + branding + effects ulang via FFmpeg).              |
| **Studio config**           | JSON config per-clip untuk customization visual (subtitle style, branding pill, ken burns, dll). |
| **Branding pill**           | Overlay elemen branding (logo/text) di clip.                                                     |
| **Ken Burns**               | Slow zoom/pan effect pada video.                                                                 |
| **Conversational captions** | Animated subtitle style yang muncul per-word mengikuti speech.                                   |
| **Face crop**               | Auto-crop 9:16 portrait berdasarkan face detection position.                                     |
| **Silence compress**        | Mempersingkat jeda diam dalam audio.                                                             |
| **Audio duck**              | Menurunkan volume backsound saat ada voice/speech.                                               |

## 4. Known Patterns & Conventions

- Pipeline stage function signature: `(ctx: StageContext) => Promise<void>`
- Job status terminal states: `COMPLETED`, `FAILED`, `CANCELLED`, `REJECTED_AD`
- Error codes enum: `VALIDATION_FAILED`, `JOB_NOT_FOUND`, `JOB_ALREADY_RUNNING`, `PURE_AD_REJECTED`, `NO_QUALIFYING_SEGMENTS`, `BINARY_NOT_FOUND`, `STAGE_FAILED`, `INTERNAL`
- Clip paths selalu relatif terhadap `media/` directories, resolved via `src/server/paths.ts`
- UI toast: 4 types (`success`, `error`, `info`, `warning`)
- Job polling: fast saat RUNNING, slow saat idle (Zustand store logic)
