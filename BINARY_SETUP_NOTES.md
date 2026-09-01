# Binary Setup Notes — Installation Complete ✅

**Status:** 🟢 All binaries installed and verified (2026-09-01T00:39 UTC)

---

## Installed Binaries

### FFmpeg 8.0.1-3ubuntu2

- **Path:** `/usr/bin/ffmpeg`
- **Installation:** `sudo apt update && sudo apt install -y ffmpeg`
- **Version requirement:** ≥7.0+ ✅ (installed: 8.0.1)
- **Status:** ✅ Verified by preflight

### FFprobe (bundled with FFmpeg 8.0.1)

- **Path:** `/usr/bin/ffprobe`
- **Status:** ✅ Verified by preflight

### yt-dlp 2026.08.19

- **Path:** `~/.local/bin/yt-dlp`
- **Installation:** `pipx install yt-dlp`
- **Version requirement:** Rolling latest ✅
- **Update:** `pipx upgrade yt-dlp`
- **Status:** ✅ Verified by preflight

### whisper.cpp 1.9.3-dev

- **Binary path:** `~/whisper.cpp/build/bin/whisper-cli`
- **Model path:** `~/whisper.cpp/models/ggml-base.bin` (148 MB)
- **Installation:**
  ```bash
  git clone https://github.com/ggml-org/whisper.cpp
  cd whisper.cpp
  cmake -B build -DCMAKE_BUILD_TYPE=Release
  cmake --build build -j 18
  bash ./models/download-ggml-model.sh base
  ```
- **Note:** whisper.cpp chosen over openai-whisper because Python 3.14 lacks PyTorch wheels
- **Status:** ✅ Verified by preflight

---

## Environment Configuration

All binary paths registered in `.env`:

```env
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe
YTDLP_PATH=/home/mohammad-yasfiq/.local/bin/yt-dlp
WHISPER_PATH=/home/mohammad-yasfiq/whisper.cpp/build/bin/whisper-cli
```

---

## Preflight Verification Command

```bash
npx tsx -r dotenv/config -e "import('./src/server/preflight.ts').then(m=>m.runPreflight().then(r=>console.log(JSON.stringify(r,null,2))))"
```

**Output (2026-09-01T00:38:32Z):**

```json
{
  "success": true,
  "directories": {
    "media": true,
    "sources": true,
    "work": true,
    "exports": true,
    "assets": true
  },
  "binaries": {
    "ffmpeg": {
      "status": true,
      "version": "ffmpeg version 8.0.1-3ubuntu2 Copyright (c) 2000-2025 the FFmpeg developers"
    },
    "ytdlp": {
      "status": true,
      "version": "2026.08.19"
    },
    "whisper": {
      "status": true,
      "version": "whisper.cpp version: 1.9.3-dev"
    }
  }
}
```

---

## System Specifications

- **OS:** Ubuntu 26.04.1 LTS (Resolute Raccoon)
- **Python:** 3.14.4
- **CPU cores:** 18
- **RAM:** 14 GB (10 GB available)
- **Storage:** 354 GB free on root partition
- **GPU:** None (CPU-only)

---

## Implementation Notes

1. **whisper.cpp input requirements:** WAV format, 16 kHz sample rate, mono audio
   - Subtitle stage (PIPE-008) will extract + resample audio via FFmpeg before Whisper

2. **Binary spawn safety:** All process executions use argument arrays (`spawn` with `shell: false`)
   - No shell command injection possible per AGENTS.md specification

3. **Preflight probing logic:**
   - FFmpeg: `-version` flag, output must contain "ffmpeg"
   - yt-dlp: `--version` flag, output must match date pattern `YYYY.MM.DD`
   - whisper: `--version` flag, output must contain "whisper"

4. **Environment loading:** `.env` must be loaded via `node -r dotenv/config` or Next.js server context

---

## Maintenance Schedule

| Binary      | Update method               | Frequency             | Notes                           |
| ----------- | --------------------------- | --------------------- | ------------------------------- |
| FFmpeg      | `apt upgrade`               | Monthly (security)    | Stable releases only            |
| yt-dlp      | `pipx upgrade yt-dlp`       | Weekly                | Rolling latest per architecture |
| whisper.cpp | Manual `git pull + rebuild` | As needed             | Model (base.bin) is immutable   |
| Models      | Manual download             | Once per major update | No auto-updates configured      |
