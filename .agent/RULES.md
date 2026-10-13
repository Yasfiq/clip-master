# Rules — Clip Master

## 1. Scope Containment

- Hanya modifikasi file yang tercantum eksplisit di `Affected Files` pada TASK.md aktif.
- Dilarang refactor massal pada file lama yang tidak berhubungan dengan target task.
- Agent boundary enforced by file path (lihat AGENTS.md roster).

## 2. Dependency Discipline

- Dilarang install package baru atau upgrade versi dependency tanpa izin tertulis.
- Approved stack only: Next.js, Tailwind CSS, Zustand, Prisma + SQLite, yt-dlp, FFmpeg, Whisper (local), Vitest, husky + lint-staged, Playwright, onnxruntime-node, Winston, Lucide React.

## 3. Non-Breaking Contract Policy

- Signature fungsi, skema database, dan endpoint API yang sudah ada tidak boleh diubah secara breaking.
- Selalu prioritaskan backward-compatibility.
- Cross-cutting changes (stage baru, enum baru, route baru, dependency baru) wajib state boundary impact sebelum implementasi.

## 4. MCP Usage Rules

- Dilarang `read_file` pada file >300 baris secara utuh. Gunakan ripgrep cari baris relevan dulu.
- Sebelum menandai task selesai, wajib panggil `git_diff` dan laporkan perubahan baris kode.

## 5. Security & Privacy

- **Localhost only.** Server bind ke `127.0.0.1`. Tidak ada auth — loopback bind = access control.
- **No data leaves the machine.** Tidak ada telemetry, analytics, crash reporting, atau third-party API calls.
- **No secrets in repo/logs.** Sensitive config di `.env` (gitignored). `.env.example` hanya key names.
- Spawn binaries dengan argument arrays only. Tidak boleh build shell string. Validate URL scheme sebelum pass ke yt-dlp.
- Strip env-derived values dari log lines sebelum persist.

## 6. Architecture Constraints

- **Single principal.** Satu role (Owner/Operator), full access. Tidak build permission tiers/sessions.
- **One active job.** Concurrency fixed at one; queued jobs wait di PENDING.
- **ESM throughout.** `"type": "module"`, strict TypeScript enabled.
- **Module alias:** `@/*` → `./src/*`
- **Components:** flat directory, no sub-folders, no barrel exports.
- Client components tidak boleh touch Prisma atau filesystem. Semua lewat REST.
- Pipeline module tree harus importable tanpa UI dependency (no React/Zustand/Tailwind import).

## 7. Code Quality

- Pre-commit: Husky + lint-staged (prettier).
- Unit tests tidak boleh invoke yt-dlp, FFmpeg, atau Whisper. Hanya smoke test + Playwright E2E yang boleh.
- Playwright E2E = release-gate only, tidak pre-commit. Behind `npm run e2e`.
- Tidak assert unconfirmed numeric threshold sebagai correct behavior. Test shape & invariants, bukan fabricated value.

## 8. Escalation (TBD — requires user confirmation)

Tidak boleh unilateral decide. Surface sebagai **TBD** dan proceed dengan surrounding structure only:

- Pure-ad rejection signals & thresholds
- Viral-potential scoring model
- Part duration default dan min/max bounds
- Source audio vs. backsound level policy
- Subtitle styling dan burn-in vs. sidecar
- Codec, container, CRF/bitrate, resolution ladder
- Pipeline process supervision & cancellation mechanics
- File retention & cleanup policy
- Node.js runtime & binary version pinning
- Numeric success-metric targets
