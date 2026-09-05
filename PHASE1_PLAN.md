# Phase 1: Intelligent Moment Detection

## Tasks

### Setup

- [x] Install Ollama + qwen2.5:7b (CPU)
- [x] Verify Ollama API works

### Pipeline Architecture

- [x] Schema: tambah `TRANSCRIBE` stage enum
- [x] `src/server/ollama.ts` — Ollama HTTP client wrapper
- [x] `src/pipeline/stages/transcribe.ts` — whisper full-video → JSON transcript
- [x] `src/pipeline/logic/momentDetection.ts` — AI moment scoring (scaffolded)
- [x] Rewrite `src/pipeline/stages/analyze.ts` — transcript + Ollama + audio features
- [x] Update `src/pipeline/stages/subtitle.ts` — slice from full transcript, retry hanya jika gagal
- [x] Update `src/pipeline/orchestrator.ts` — wire TRANSCRIBE setelah AD_FILTER
- [x] Update `src/server/paths.ts` — BINARIES.ollama (optional)

### Quality

- [x] Update config defaults: 3-5 min clips, 9:16 output, max clips 5
- [ ] Test E2E: video 55 menit → moment detection → 3-5 klip 3-5 menit

### Pure Logic Unit Tests

- [ ] `momentDetection.ts` unit tests: scoring, confidence, fallback
- [ ] Update `analyze.test.ts` untuk AI-enhanced pipeline

## Stage Order (new)

```
DISCOVER → AD_FILTER → TRANSCRIBE → ANALYZE(AI) → CUT → EDIT → SUBTITLE → EXPORT → COMPRESS
```
