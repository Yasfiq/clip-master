# Orchestrator — Clip Master

Protokol eksekusi dan koordinasi agent. Dokumen ini menentukan **bagaimana** agent bekerja: workflow mana yang dipilih, kapan human-in-the-loop, dan bagaimana transisi antar step.

---

## 1. Workflow Selection

Saat menerima instruksi dari user, tentukan workflow yang tepat berdasarkan sinyal:

| Sinyal                                                 | Workflow                            | File                              |
| ------------------------------------------------------ | ----------------------------------- | --------------------------------- |
| "tambah fitur X", "buat halaman Y", "refactor Z"       | **Feature Dev**                     | `.agent/WORKFLOWS/feature-dev.md` |
| "fix bug", "error saat ...", "tidak bisa ...", "crash" | **Bug Fix**                         | `.agent/WORKFLOWS/bug-fix.md`     |
| Instruksi ambigu                                       | **Tanya user** dulu — jangan asumsi | —                                 |

Jika selama bug fix ternyata scope membesar (> 3 file, butuh schema change, > 50 baris), eskalasi ke Feature Dev workflow.

---

## 2. Context Loading Protocol

Sebelum eksekusi step manapun, muat context secara bertahap — jangan load semua sekaligus:

### Always Loaded (setiap interaksi)

- `.agent/RULES.md` — hard constraints, tidak boleh dilanggar

### Loaded Per-Workflow

- `.agent/ARCHITECTURE.md` — saat butuh referensi struktur, dependency, atau convention
- `.agent/KNOWLEDGE.md` — saat masuk area yang sudah punya catatan gotcha/debt

### Loaded Per-Task (on demand)

- `.agent/SKILLS/core/anti-slop.md` — saat menulis/mengubah UI
- `.agent/SKILLS/core/diff-containtment.md` — saat Step Diff Audit
- `.agent/SKILLS/core/verification-runner.md` — saat Step Verify/Implementation
- `.agent/SKILLS/project/<skill>.md` — saat mengerjakan area terkait:

| Area Kerja                     | Skill                    |
| ------------------------------ | ------------------------ |
| FFmpeg, binary, filter graph   | `ffmpeg-pipeline.md`     |
| Schema, migration, DB query    | `prisma-migration.md`    |
| API route handler              | `nextjs-api-route.md`    |
| Pipeline stage baru/modifikasi | `pipeline-stage.md`      |
| React component                | `component-authoring.md` |

---

## 3. MCP Usage Protocol

Tiga core MCP wajib digunakan sesuai fungsinya:

| Aksi                                   | MCP Tool       |
| -------------------------------------- | -------------- |
| Cari fungsi, string, definisi, caller  | **Ripgrep**    |
| Baca/tulis file, list directory        | **Filesystem** |
| Cek status repo, inspect diff, history | **Git**        |

### Constraints

- **Ripgrep dulu, read kemudian.** Jangan `read_file` pada file > 300 baris. Gunakan ripgrep untuk menemukan baris relevan, lalu read hanya section yang dibutuhkan.
- **git_diff wajib** sebelum menandai pekerjaan selesai. Tidak ada exception.
- **Filesystem sandbox** — hanya baca/tulis di dalam root project.

---

## 4. Step Execution Rules

### Sequential & Blocking

Setiap step dalam workflow HARUS selesai sebelum lanjut ke step berikutnya. Tidak boleh skip step.

### Human-in-the-Loop Checkpoints

| Checkpoint         | Kapan                                           | Aksi                                                           |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------- |
| **Spec Review**    | Setelah Feature Dev Step 2 (Mini-Spec)          | Tunjukkan spec ke user, minta approval sebelum breakdown task  |
| **Task Review**    | Setelah Feature Dev Step 3 (Task Breakdown)     | Tunjukkan TASK.md ke user, minta approval sebelum mulai coding |
| **Escalation**     | Saat menemukan item di RULES.md Section 8 (TBD) | Tanya user, jangan decide sendiri                              |
| **Cross-Boundary** | Saat perubahan impact > 1 agent boundary        | State impact, minta approval                                   |
| **Diff Review**    | Setelah Step Diff Audit                         | Laporkan ringkasan diff, user confirm                          |

### Auto-Proceed (tanpa approval)

- Bug Fix Step 1-3 jika scope kecil (≤ 2 file, ≤ 30 baris)
- Feature Dev Step 1 (Impact Analysis) — ini read-only, aman
- Knowledge Update — append-only, tidak merusak

---

## 5. Task Status Protocol

Status task di `TASK.md`:

```
[ ] Pending     — belum dikerjakan
[~] In Progress — sedang dikerjakan (hanya 1 task pada satu waktu)
[x] Done        — selesai, verified
[!] Blocked     — butuh input user atau dependency belum selesai
```

### Rules:

- Hanya satu task `[~]` pada satu waktu.
- Task ditandai `[x]` HANYA setelah:
  1. Kode ditulis
  2. Test pass (jika applicable)
  3. Lint clean
  4. Acceptance criteria terpenuhi
- Task `[!]` harus disertai alasan block.

---

## 6. Agent Boundary Enforcement

Berdasarkan `AGENTS.md` roster:

| Agent             | Owns                                                       | Never Touches                      |
| ----------------- | ---------------------------------------------------------- | ---------------------------------- |
| `@pipeline-agent` | `src/pipeline/`, `src/server/`, `prisma/schema.prisma`     | React, Zustand, Tailwind           |
| `@webui-agent`    | `src/app/`, `src/components/`, `src/stores/`, `src/types/` | Stage logic, FFmpeg/yt-dlp/Whisper |
| `@qa-agent`       | `tests/`, Vitest config, husky/lint-staged                 | Production source code             |

### Cross-Boundary Change Protocol:

1. Proposing agent states: "Perubahan ini impact `<file>` yang owned oleh `<agent>`."
2. Jelaskan contract change (DTO shape, enum value, API route).
3. Minta user approval.
4. Implementasi di kedua sisi dalam task terpisah.

---

## 7. Error & Recovery

### Agent Error (gagal di tengah task)

1. Tandai task `[!] Blocked — <alasan>`.
2. Laporkan ke user dengan konteks: file apa yang sudah diubah, apa yang belum.
3. Jangan rollback secara otomatis — biarkan user decide.

### Test Failure

1. Jangan lanjut ke task berikutnya.
2. Analisis failure — apakah bug di kode baru atau test expectation salah?
3. Fix dan re-run sampai pass.

### Build Failure

1. Cek apakah type error, import error, atau runtime error.
2. Fix di file yang menyebabkan error (harus masih dalam scope task).
3. Jika fix butuh ubah file di luar scope, tanya user dulu.

---

## 8. Session Handoff

Jika pekerjaan belum selesai di akhir session:

1. Update TASK.md — tandai progress terakhir.
2. Catat di KNOWLEDGE.md jika ada temuan baru.
3. Tulis ringkasan singkat:
   ```markdown
   ### Session Handoff — <tanggal>

   - Last completed: Task <N>
   - In progress: Task <N+1> — <status>
   - Blockers: <jika ada>
   - Next action: <apa yang harus dilakukan selanjutnya>
   ```

Session berikutnya: baca TASK.md → resume dari task terakhir.

---

## 9. Execution Flowchart

```
User Input
    │
    ▼
Classify: Feature / Bug / Ambiguous
    │
    ├─ Ambiguous → Tanya user → Re-classify
    │
    ├─ Feature → Load feature-dev.md
    │   ├─ Step 1: Impact Analysis (ripgrep)
    │   ├─ Step 2: Mini-Spec → ⏸ USER REVIEW
    │   ├─ Step 3: Task Breakdown → ⏸ USER REVIEW
    │   ├─ Step 4: Implementation Loop
    │   │   └─ Per task: skill load → code → test → lint → mark done
    │   ├─ Step 5: Diff Audit → ⏸ USER REVIEW
    │   └─ Step 6: Knowledge Update
    │
    └─ Bug → Load bug-fix.md
        ├─ Step 1: Reproduce
        ├─ Step 2: Root Cause (ripgrep)
        ├─ Step 3: Fix (minimal diff)
        ├─ Step 4: Verify (test)
        ├─ Step 5: Diff Audit → ⏸ USER REVIEW
        └─ Step 6: Knowledge Update
```
