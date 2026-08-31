## Required Binaries for Clip Master

### 1. FFmpeg (v7.0+)

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg
# macOS (Homebrew)
brew install ffmpeg
# Verify
ffmpeg -version
```

### 2. yt-dlp (rolling latest)

```bash
# Install
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
# Verify
yt-dlp --version
```

### 3. Whisper (local, base model)

Two options:

**A. OpenAI Whisper (Python)**

```bash
pip install openai-whisper
whisper --model base --language id sample.mp4
```

**B. whisper.cpp (C++, better for CLI)**

```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
make
./models/download-ggml-model.sh base
# Test
./main -m models/ggml-base.bin -f sample.wav -l auto -osrt
```

### Note for Implementation

Pipeline expects binaries on PATH. Orchestrator will check on startup and fail fast if missing.

Binary paths can be overridden in .env:

```
FFMPEG_PATH=/usr/local/bin/ffmpeg
YTDLP_PATH=/usr/local/bin/yt-dlp
WHISPER_PATH=/home/user/whisper.cpp/main
```
