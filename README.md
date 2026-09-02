# Clip Master

**Local-first automation tool untuk mengubah long-form video menjadi viral short clips.**

🎬 YouTube → 🎯 TikTok/Reels/Shorts siap unggah dalam satu pipeline.

---

## Features

- ✅ Download otomatis dari YouTube (via yt-dlp)
- ✅ Pure-ad detection & filtering
- ✅ Segment scoring berbasis viral metrics (motion, audio, hook strength)
- ✅ Auto-cutting ke 2-5 menit clips
- ✅ Audio mixing dengan background music + ducking
- ✅ Subtitle generation (Whisper ASR → SRT)
- ✅ Color grading (5 preset: vivid, warm, cool, cinematic, vintage)
- ✅ H.264 export (1080p max, CRF 21)
- ✅ Real-time dashboard & job monitoring

---

## Tech Stack

- **Frontend:** Next.js 16 + React 19 + Tailwind CSS v4
- **Backend:** Node.js 24 + Prisma 7 + SQLite
- **Media:** FFmpeg 8.0, yt-dlp (latest), Whisper.cpp
- **Testing:** Vitest 4

---

## Prerequisites

1. **Node.js 22.x LTS** atau lebih baru (tested: v24.19.0)
2. **FFmpeg 7.0+** di PATH
3. **yt-dlp** (latest) di PATH
4. **Whisper.cpp** compiled dengan model `ggml-base.bin`

### Install Binary Dependencies

#### FFmpeg (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install ffmpeg
ffmpeg -version  # Verify 7.0+
```

#### yt-dlp

```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
yt-dlp --version
```

#### Whisper.cpp

```bash
cd ~
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
make
bash ./models/download-ggml-model.sh base
# Binary: ~/whisper.cpp/build/bin/whisper-cli
# Model: ~/whisper.cpp/models/ggml-base.bin
```

Update `.env` dengan path binary:

```bash
WHISPER_BIN=/home/yourusername/whisper.cpp/build/bin/whisper-cli
WHISPER_MODEL=/home/yourusername/whisper.cpp/models/ggml-base.bin
```

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Database

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

### 3. Create Media Directories

```bash
mkdir -p media/{sources,work,exports,assets}
```

### 4. Configure Environment

```bash
cp .env.example .env
# Edit .env dengan path binary Whisper
```

### 5. Run Preflight Check

```bash
npm run check
```

Expected output:

```
✅ FFmpeg: 8.0.1
✅ yt-dlp: 2026.08.19
✅ Whisper: 1.9.3-dev
```

### 6. Start Development Server

```bash
npm run dev
```

Open http://localhost:3000

---

## Usage

### Via Web UI

1. Buka dashboard di `http://localhost:3000`
2. Klik **New Job**
3. Paste YouTube URL atau pilih file lokal
4. Klik **Start Job**
5. Monitor progress real-time
6. Download clips dari tab **Clips**

### Via CLI (Experimental)

```bash
npm run pipeline -- --url "https://youtube.com/watch?v=VIDEO_ID"
```

---

## Configuration

Default pipeline config tersimpan di database (`PipelineConfig` table).

Edit via UI: **Settings** → **Pipeline**, **Video**, **Export** tabs.

Key parameters:

- **Min Duration:** 120s
- **Max Duration:** 300s
- **Target Duration:** 180s
- **Ad Filter:** Enabled, threshold 0.7
- **Color Grading:** vivid
- **Subtitle:** Enabled (Indonesian)

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│               Next.js App (Port 3000)            │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐     │
│  │Dashboard │  │ Settings │  │ Clip Gallery│    │
│  └────┬─────┘  └─────┬────┘  └─────┬──────┘     │
│       │              │              │            │
│       └──────────────┴──────────────┘            │
│                      │                           │
│              ┌───────▼────────┐                  │
│              │   REST API     │                  │
│              │ /api/jobs      │                  │
│              │ /api/config    │                  │
│              └───────┬────────┘                  │
│                      │                           │
│         ┌────────────▼───────────┐               │
│         │   Pipeline Runner      │               │
│         │  8-Stage Orchestrator  │               │
│         └────────────┬───────────┘               │
│                      │                           │
│    ┌─────────────────┴──────────────────┐        │
│    │ DISCOVER → AD_FILTER → ANALYZE →   │        │
│    │ CUT → EDIT → SUBTITLE → EXPORT →   │        │
│    │ COMPRESS                            │        │
│    └─────────────────┬──────────────────┘        │
│                      │                           │
│         ┌────────────▼───────────┐               │
│         │  FFmpeg | yt-dlp |     │               │
│         │  Whisper.cpp           │               │
│         └────────────────────────┘               │
└─────────────────────────────────────────────────┘
           │                    │
      ┌────▼─────┐        ┌────▼────┐
      │  SQLite  │        │  Media  │
      │  dev.db  │        │  Files  │
      └──────────┘        └─────────┘
```

---

## Testing

```bash
# Unit tests
npm run test

# Integration tests (require dev server running)
npm run test:integration

# Build verification
npm run build
```

---

## Project Structure

```
clip-master/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── api/          # REST endpoints
│   │   ├── page.tsx      # Dashboard
│   │   ├── settings/     # Settings page
│   │   └── clips/        # Clip gallery
│   ├── components/       # React components
│   ├── pipeline/         # Core logic
│   │   ├── stages/       # 8 pipeline stages
│   │   ├── logic/        # Pure functions
│   │   └── binaries/     # Binary wrappers
│   ├── server/           # Backend services
│   └── stores/           # Zustand state
├── prisma/
│   └── schema.prisma     # Database schema
├── tests/
│   ├── unit/             # Unit tests
│   └── integration/      # Integration tests
├── media/                # Media storage
│   ├── sources/          # Downloaded videos
│   ├── work/             # Temp processing
│   ├── exports/          # Final clips
│   └── assets/           # Background music
└── scripts/              # Automation scripts
```

---

## Troubleshooting

### "Binary not found: ffmpeg"

Pastikan FFmpeg di PATH: `which ffmpeg`

### "Whisper model not found"

Check path di `.env`: `WHISPER_MODEL=/path/to/ggml-base.bin`

### "Job stuck in RUNNING"

Restart: `npm run dev` (crash recovery auto-detects)

### "Out of memory during subtitle"

Whisper base model butuh ~2GB RAM per clip

---

## License

MIT License - lihat LICENSE file.

---

## Contributing

Project ini local-first & single-user by design. Kontribusi welcome untuk:

- Bug fixes
- Test coverage
- Documentation improvements

Open issue dulu sebelum PR besar.

---

**Built with ❤️ for content creators**
