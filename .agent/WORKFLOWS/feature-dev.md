# Workflow: Feature Development (Brownfield)

Alur kerja untuk menambah fitur baru pada codebase yang sudah berjalan. Setiap step wajib selesai sebelum lanjut ke step berikutnya.

---

## Step 1: Impact Analysis (Ripgrep Scan)

Sebelum menulis apapun, identifikasi blast radius fitur baru.

**Actions:**

1. Gunakan `ripgrep` untuk cari file, fungsi, dan tipe yang akan terpengaruh.
2. Cari semua consumer/caller dari area yang akan diubah.
3. Identifikasi apakah perubahan cross-boundary (pipeline ↔ webui ↔ qa).

**Output:**

- Daftar `Affected Files` dengan alasan masing-masing.
- Boundary impact statement (agent mana yang terdampak).

**Guard:**

- Jika affected files > 10, pecah fitur jadi sub-fitur lebih kecil.
- Jika cross-boundary, state impact ke semua agent sebelum lanjut.

---

## Step 2: Mini-Spec (PRD/TSD Ringkas)

Tulis spesifikasi ringkas — bukan dokumen penuh, cukup scope fitur ini saja.

**Template:**

```markdown
## Feature: <nama fitur>

### Problem

<1-2 kalimat masalah yang diselesaikan>

### Solution

<1-2 kalimat solusi teknis>

### Scope

- IN: <apa yang dikerjakan>
- OUT: <apa yang TIDAK dikerjakan>

### Affected Files

- `path/to/file.ts` — <alasan>

### Data Changes

- Schema: <perubahan model/enum, atau "none">
- API: <endpoint baru/berubah, atau "none">
- UI: <komponen baru/berubah, atau "none">

### Acceptance Criteria

1. <kriteria testable>
2. <kriteria testable>
```

**Guard:**

- Scope IN maksimal 3 item untuk satu siklus.
- Setiap acceptance criteria harus bisa diverifikasi secara mekanis (test atau manual check).

---

## Step 3: Task Breakdown (TASK.md)

Pecah spec jadi unit kerja atomik di `.agent/TASK.md`.

**Rules:**

- Satu task = satu commit logis.
- Setiap task punya `Affected Files` eksplisit.
- Setiap task punya acceptance criteria sendiri.
- Urutan task = urutan dependensi (schema dulu, lalu logic, lalu API, lalu UI).

**Template per task:**

```markdown
### Task <N>: <judul>

**Status:** [ ] Pending

**Affected Files:**

- `path/to/file.ts`

**Acceptance Criteria:**

- [ ] <kriteria>

**Notes:**
<konteks tambahan jika perlu>
```

**Guard:**

- Jika satu task butuh modifikasi > 5 file, pecah lagi.
- Task tidak boleh punya dependensi sirkular.

---

## Step 4: Implementation (Execution Loop)

Eksekusi task satu per satu secara berurutan.

**Per task:**

1. Baca task aktif dari TASK.md.
2. Muat skill yang relevan dari `.agent/SKILLS/`:
   - Schema change → `prisma-migration.md`
   - Pipeline logic → `pipeline-stage.md` + `ffmpeg-pipeline.md`
   - API route → `nextjs-api-route.md`
   - UI component → `component-authoring.md`
3. Implementasi kode sesuai skill conventions.
4. Tulis/update test (unit test untuk pure logic, skip untuk trivial one-liners).
5. Jalankan verifikasi:
   ```bash
   npm run lint          # eslint clean
   npm run test:unit     # vitest unit pass
   npm run build         # next build clean (jika perubahan signifikan)
   ```
6. Perbarui status task di TASK.md: `[x]`.

**Guard:**

- Jangan lanjut ke task berikutnya jika test gagal.
- Jangan modifikasi file di luar `Affected Files` task aktif.
- File > 300 baris: gunakan ripgrep dulu, jangan read utuh.

---

## Step 5: Diff Audit (Change Safety)

Setelah semua task selesai, audit perubahan sebelum commit.

**Actions:**

1. Panggil `git_diff` untuk melihat semua perubahan.
2. Jalankan checklist dari `diff-containtment.md`:
   - [ ] Semua file yang berubah ada di `Affected Files`
   - [ ] Tidak ada file yang berubah di luar scope
   - [ ] Tidak ada dependency baru yang ditambah tanpa izin
   - [ ] Tidak ada secret/credential yang bocor
   - [ ] Tidak ada formatting-only changes di file yang bukan target
3. Laporkan ringkasan perubahan.

**Output:**

```markdown
### Diff Summary

- Files changed: <N>
- Lines added: <N>
- Lines removed: <N>
- New dependencies: none / <list>
- Out-of-scope changes: none / <list dengan justifikasi>
```

---

## Step 6: Knowledge Update

Jika selama implementasi ditemukan gotcha, edge case, atau debt baru:

1. Append ke `.agent/KNOWLEDGE.md` di section yang relevan.
2. Jangan hapus entry lama — append-only.

---

## Ringkasan Alur

```
Impact Analysis → Mini-Spec → Task Breakdown → Implementation Loop → Diff Audit → Knowledge Update
    (ripgrep)      (PRD/TSD)    (TASK.md)        (code + test)       (git_diff)    (KNOWLEDGE.md)
```
