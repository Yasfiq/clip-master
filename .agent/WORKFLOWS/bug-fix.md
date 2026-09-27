# Workflow: Bug Fix / Hotfix

Alur kerja untuk memperbaiki bug. Lebih pendek dari feature-dev — skip PRD/TSD, langsung ke root cause dan fix.

---

## Step 1: Reproduce & Confirm

Pastikan bug bisa direproduksi sebelum sentuh kode.

**Actions:**

1. Baca laporan bug — pahami expected vs actual behavior.
2. Cari evidence:
   - Error message / stack trace di logs (`logs/app.log` atau `JobLog` di DB)
   - Screenshot / langkah reproduksi dari user
3. Reproduksi secara lokal jika memungkinkan:
   ```bash
   npm run dev          # start server
   npm run test:unit    # cek apakah ada test yang sudah gagal
   ```

**Output:**

- Confirmed: bug bisa direproduksi, atau
- Not Reproduced: butuh info tambahan dari user — STOP, jangan lanjut.

---

## Step 2: Root Cause Analysis (Ripgrep)

Temukan akar masalah tanpa baca file utuh.

**Actions:**

1. Gunakan `ripgrep` untuk cari:
   - Error message string di codebase
   - Fungsi/variable yang disebut di stack trace
   - Related logic di area yang dicurigai
2. `read_file` hanya baris yang relevan (±20 baris dari temuan ripgrep).
3. Identifikasi root cause — jelaskan dalam 1-2 kalimat.

**Output:**

```markdown
### Root Cause

**File:** `path/to/file.ts:123`
**Cause:** <1-2 kalimat penjelasan>
**Impact:** <apa yang rusak akibat bug ini>
```

**Guard:**

- Jangan langsung fix tanpa root cause yang jelas.
- Jika root cause melibatkan > 3 file, pertimbangkan apakah ini sebenarnya refactor, bukan bug fix. Jika ya, pindah ke `feature-dev.md` workflow.

---

## Step 3: Fix (Minimal Diff)

Perbaiki bug dengan perubahan sekecil mungkin.

**Rules:**

1. **Shortest diff wins** — fix hanya root cause, jangan refactor area sekitar.
2. Affected files: idealnya 1-2 file saja.
3. Muat skill yang relevan:
   - Pipeline bug → `pipeline-stage.md`, `ffmpeg-pipeline.md`
   - API bug → `nextjs-api-route.md`
   - UI bug → `component-authoring.md`
   - Schema bug → `prisma-migration.md`
4. Jangan ubah behavior lain yang kebetulan terlihat "salah" — itu task terpisah.

**Guard:**

- Jika fix butuh > 50 baris perubahan, review ulang — mungkin scope terlalu besar.
- Jangan tambah dependency baru untuk fix bug.

---

## Step 4: Verify Fix

Pastikan bug benar-benar teratasi dan tidak ada regresi.

**Actions:**

1. Tulis atau update test yang cover bug ini (regression test):
   ```typescript
   // tests/unit/<area>.test.ts
   it('should not <reproduce bug condition>', () => {
     // arrange: setup kondisi yang trigger bug
     // act: jalankan logic
     // assert: expected behavior, bukan bug behavior
   });
   ```
2. Jalankan test suite:
   ```bash
   npm run test:unit          # semua unit test pass
   npm run lint               # eslint clean
   ```
3. Manual verify jika bug melibatkan UI:
   - `npm run dev` → reproduksi langkah yang tadinya trigger bug → confirm fixed.

**Guard:**

- Bug fix tanpa regression test = tidak selesai (kecuali bug di area yang tidak bisa di-unit-test, misal FFmpeg output visual).
- Semua existing test harus tetap pass.

---

## Step 5: Diff Audit

**Actions:**

1. Panggil `git_diff`.
2. Checklist minimal:
   - [ ] Hanya file yang terkait bug yang berubah
   - [ ] Tidak ada perubahan di luar scope fix
   - [ ] Regression test ditambahkan
   - [ ] Tidak ada formatting-only changes di file lain

**Output:**

```markdown
### Bug Fix Summary

- **Bug:** <deskripsi 1 baris>
- **Root Cause:** `file.ts:123` — <cause>
- **Fix:** <apa yang diubah>
- **Files changed:** <N>
- **Regression test:** `tests/unit/<file>.test.ts`
```

---

## Step 6: Knowledge Update

Jika bug mengungkap area fragile atau gotcha baru:

1. Append ke `.agent/KNOWLEDGE.md` section "Technical Debt & Fragile Areas".
2. Catat kondisi yang menyebabkan bug agar tidak terulang.

---

## Ringkasan Alur

```
Reproduce → Root Cause (ripgrep) → Fix (minimal diff) → Verify (test) → Diff Audit → Knowledge Update
```

## Kapan Eskalasi ke Feature-Dev Workflow

Pindah ke `feature-dev.md` jika:

- Root cause melibatkan > 3 file
- Fix membutuhkan schema change
- Fix membutuhkan API contract change
- Fix sebenarnya adalah missing feature
- Perubahan > 50 baris
