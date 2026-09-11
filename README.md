# Clip Master

**Local-first automation tool untuk mengubah long-form video menjadi klip pendek vertikal (Shorts, Reels, TikTok) berkualitas tinggi.**

🎬 Video Panjang (YouTube / Berkas Lokal) → 🎯 Klip Siap Unggah 1080x1920 (9:16) dalam satu pipeline otomatis.

---

## Fitur Utama

- **Ingesti & Filter Iklan:**
  - Unduh otomatis dari YouTube melalui `yt-dlp` atau gunakan berkas video lokal.
  - _Pure-ad rejection_: Menolak video yang sepenuhnya merupakan iklan, menerima video dengan iklan sisipan (_mid-roll/embedded ads_).
- **Transkripsi & Chunking Subtitle:**
  - Ekstraksi audio dan transkripsi lokal menggunakan `whisper.cpp` (model multilingual `ggml-small.bin`).
  - _Word-level chunking_: Membatasi subtitle maksimal 3 kata per baris dengan sinkronisasi waktu perkata yang presisi tanpa memotong kata tunggal menjadi suku kata.
- **Analisis Segmen Viral:**
  - Penilaian segmen otomatis berdasarkan pergerakan visual, intensitas audio, dan kekuatan hook.
  - Batas klip dinamis hingga 50 klip per job.
- **Deteksi Wajah & Framing Dinamis (9:16):**
  - _Spatial face clustering_: Mendeteksi pembicara dominan pada wawancara/podcast dua orang (menghindari pemotongan ruang kosong di tengah).
  - Efek _Ken Burns_ (slow push-in zoom) untuk gerakan kamera dinamis pada video potret.
- **Penyuntingan & Audio Mixing:**
  - 5 preset color grading (vivid, warm, cool, cinematic, vintage).
  - Penyesuaian volume audio latar belakang (_backsound_) otomatis dengan _ducking_ saat suara vokal terdeteksi.
- **Editor Subtitle Manual & Re-Burn Langsung:**
  - Pratinjau video vertikal langsung di dashboard dengan navigasi waktu cue interaktif.
  - Penyuntingan teks dan durasi cue subtitle secara manual untuk memperbaiki kesalahan transkripsi.
  - Render ulang video mandiri (_re-burn_) secara atomik tanpa perlu memproses ulang pemotongan video dari awal.
  - Dukungan beragam gaya subtitle (_TikTok_, _SULE_, _KAMAL_).
- **Ekspor & Kompresi:**
  - H.264 / CRF 21, resolusi target 1080x1920, audio stereo AAC 192k 48kHz.
- **Dashboard Web Lokal:**
  - Dibangun dengan Next.js App Router, Tailwind CSS, dan Zustand.
  - Monitoring log dan status real-time via SSE (_Server-Sent Events_).
  - 100% lokal, privasi penuh, tanpa ketergantungan API eksternal berbayar.

---

## Arsitektur Pipeline (Two-Phase Architecture)

Pipeline pemrosesan video dibagi menjadi dua fase terpisah:

```
┌─────────────────────────────────────────────────────────────────┐
│                      FASE 1: PRE-PROCESSING                     │
│  DISCOVER ──► AD_FILTER ──► TRANSCRIBE ──► ANALYZE ──► CUT      │
│  (Ingesti)    (Filter Ad)   (Whisper)      (Scoring)   (Potong) │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼ (Status: PHASE1_DONE)
┌─────────────────────────────────────────────────────────────────┐
│                      FASE 2: POST-PROCESSING                    │
│    EDIT     ──►   SUBTITLE   ──►   EXPORT   ──►   COMPRESS      │
│  (Grading)       (Bakar SRT)     (Assemble)    (Final Encode)   │
└─────────────────────────────────────────────────────────────────┘
```

1. **Fase 1 (DISCOVER s/d CUT):** Menghasilkan potongan video mentah (`cuts/`) dan transkrip kata. Status job berhenti di `PHASE1_DONE` sehingga operator dapat meninjau hasil segmen.
2. **Fase 2 (EDIT s/d COMPRESS):** Menerapkan color grading, perataan framing wajah 9:16, pembakaran subtitle, dan kompresi akhir ke direktori `media/exports/`.

---

## Antarmuka REST API

| Method        | Endpoint                    | Deskripsi                                                      |
| ------------- | --------------------------- | -------------------------------------------------------------- |
| `GET`         | `/api/jobs`                 | Mengambil daftar riwayat job pemrosesan                        |
| `POST`        | `/api/jobs`                 | Membuat job baru dari URL YouTube atau path lokal              |
| `GET`         | `/api/jobs/:id`             | Detail status, progres, dan metadata job                       |
| `POST`        | `/api/jobs/:id`             | Mengontrol aksi job (`start`, `cancel`, `delete`)              |
| `POST`        | `/api/jobs/:id/phase2`      | Memulai eksekusi Fase 2 untuk job yang berada di `PHASE1_DONE` |
| `GET`         | `/api/jobs/:id/logs/stream` | Stream log real-time menggunakan SSE                           |
| `GET`         | `/api/clips`                | Mengambil daftar seluruh klip hasil ekspor                     |
| `GET`         | `/api/clips/:id/file`       | Streaming video klip dengan dukungan HTTP Range                |
| `GET`         | `/api/clips/:id/subtitles`  | Mengambil daftar cue subtitle (SRT) klip                       |
| `PUT`         | `/api/clips/:id/subtitles`  | Menyimpan perubahan cue subtitle ke disk dan database          |
| `POST`        | `/api/clips/:id/re-burn`    | Merender ulang video dengan subtitle yang telah disunting      |
| `GET` / `PUT` | `/api/config`               | Mengambil dan memperbarui konfigurasi pipeline                 |

---

## Prasyarat Sistem

1. **Node.js 22+ LTS** (disarankan Node.js v24)
2. **FFmpeg 7.0+** (tersedia di PATH sistem)
3. **yt-dlp** (versi terbaru di PATH sistem)
4. **Whisper.cpp** dengan model terkompilasi (misalnya `ggml-small.bin` atau `ggml-base.bin`)

### Pemasangan Binary (Ubuntu / Debian)

```bash
# 1. FFmpeg
sudo apt update && sudo apt install -y ffmpeg

# 2. yt-dlp
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# 3. Whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
make
bash ./models/download-ggml-model.sh small
```

---

## Panduan Memulai Cepat (Quick Start)

### 1. Pasang Dependensi

```bash
npm install
```

### 2. Konfigurasi Environment

Salin berkas `.env.example` menjadi `.env` dan sesuaikan path binary:

```bash
cp .env.example .env
```

Contoh isi `.env`:

```env
PORT=3000
DATABASE_URL="file:./dev.db"
MEDIA_ROOT="./media"
WHISPER_BIN="/path/to/whisper.cpp/build/bin/whisper-cli"
WHISPER_MODEL="/path/to/whisper.cpp/models/ggml-small.bin"
```

### 3. Inisialisasi Database SQLite

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

### 4. Buat Direktori Media

```bash
mkdir -p media/{sources,work,exports,assets}
```

### 5. Jalankan Server Aplikasi

```bash
npm run dev
```

Buka peramban di `http://localhost:3000`.

---

## Pengujian & Verifikasi

Proyek dilengkapi dengan pengujian unit otomatis dan pengujian end-to-end berbasis browser:

```bash
# Menjalankan seluruh pengujian unit (281 test suite)
npm run test:unit

# Verifikasi kompilasi TypeScript
npx tsc --noEmit

# Menjalankan pengujian browser End-to-End Playwright
npx playwright test tests/e2e/subtitle-editor.spec.ts

# Production build check
npm run build
```

---

## Struktur Direktori

```
clip-master/
├── src/
│   ├── app/              # Next.js App Router (halaman & REST API)
│   ├── components/       # Komponen UI React (Dashboard, SubtitleEditorModal, dll.)
│   ├── pipeline/         # Logika media & eksekusi binary
│   │   ├── logic/        # Logika murni (adFilter, faceCrop, srtParser, wordChunker)
│   │   ├── stages/       # Modul tahapan pipeline (transcribe, cut, edit, reBurn)
│   │   └── binaries/     # Wrapper proses eksternal (FFmpeg, Whisper, yt-dlp)
│   ├── server/           # Database Prisma, paths, logger
│   └── stores/           # Zustand client state management
├── prisma/               # Skema database SQLite
├── tests/
│   ├── unit/             # Pengujian unit Vitest
│   └── e2e/              # Pengujian Playwright browser nyata
└── media/                # Penyimpanan berkas media lokal
    ├── sources/          # Video sumber asli
    ├── work/             # Berkas kerja sementara (cuts, transcripts, edited)
    └── exports/          # Hasil klip akhir siap unggah
```

---

## Lisensi

MIT License. Dibuat untuk pemrosesan video lokal yang cepat, efisien, dan bebas biaya API eksternal.
