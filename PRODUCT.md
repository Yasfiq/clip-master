# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Single role: **Owner/Operator** — the person who runs Clip Master on their own
machine and produces short-form clips from long-form video. One user, full
access to every function. No second actor, no permission tiers.

For the public launch surface the same operator drives the tool in "laypeople
mode": a web dashboard whose settings speak plain language (clip length,
captions, ad filtering) instead of pipeline jargon (segment durations, ducking
thresholds, codec presets). Technical depth is hidden behind an Advanced layer,
never removed — the operator is comfortable with detail when they choose it.

## Product Purpose

Clip Master turns one long-form video (URL or local file) into multiple
export-ready short-form clips through a deterministic local pipeline:
download → ad filter → viral segment analysis → cut → edit → auto subtitles →
export → compress. The operator triggers a job, walks away, and returns to a
dashboard showing status, logs, and finished clips.

Success: a link in, several publishable Shorts/Reels/TikTok clips out, with the
dashboard explaining progress and failures clearly.

## Positioning

A locally-run single-user Shorts factory. The differentiator is automation of
the whole mechanical chain (download, scrub, cut, grade, mix, transcribe,
burn-in, export, compress) inside one job, with every decision deterministic
and testable. Video, clips, transcripts, and logs never leave the owner's disk;
the loopback bind is the access-control boundary.

## Operating Context

- Runs on the operator's machine, localhost only (`127.0.0.1`), no auth by
  design. Next.js dashboard is the primary surface; a CLI entry exists.
- Pipeline is split in two phases: Phase 1 (DISCOVER → AD_FILTER → TRANSCRIBE →
  ANALYZE → CUT) pauses for review at PHASE1_DONE; Phase 2 (EDIT → SUBTITLE →
  EXPORT → COMPRESS) runs from the review point.
- External binaries: yt-dlp, ffmpeg/ffprobe, local whisper.cpp. Node 24,
  Prisma + SQLite, Next.js App Router, Tailwind, Zustand.
- Concurrency fixed at one active job; additional jobs queue in PENDING.

## Capabilities and Constraints

- Source: manual video URL or local file. Pure-ad videos rejected with a reason
  code before processing; embedded/mid-roll ads (iklan sisipan) do not cause
  rejection. Ambiguous signals fail toward acceptance.
- Analysis ranks candidate windows by viral potential (AI transcript scoring
  via local Ollama when a transcript exists, audio-energy heuristics otherwise)
  and caps output at a configurable number of clips.
- Editing: original (natural) color grading is the default and currently the
  only exposed choice; backsound ducking under voice, silence compression, and
  face-aware vertical crop run as fixed internal behaviors.
- Subtitles: burned-in, English/Indonesian auto via Whisper `auto`; styling
  (line length, line count, cue duration bounds) is fixed internal policy.
- Export: 9:16 portrait Shorts, H.264/AAC CRF encode, +faststart. Target
  resolution is configurable from the UI.
- UI language: English. Video Style picker is intentionally absent — natural
  color is used, not a preset gallery.
- Config lives in PipelineConfig rows (SQLite). Seed row `name=default` is the
  active config. The Settings page saves into the default row.
- Explicitly undecided / deferred: trending feeds, follow-channel discovery,
  sound effects, visual overlays, advanced effects, multi-job parallelism,
  cloud anything.

## Brand Commitments

Name: **Clip Master**. English UI copy. Natural/original color grading is a
confirmed product choice for output (no filter presets on the launch surface).

## Evidence on Hand

- `PRD.md` — full product vision, persona, MVP scope, and non-goals.
- `tests/` — unit suites for ad filter, analyze, cut, naming, subtitle wrap,
  color grade, ducking, face crop, Ken Burns, silence compression, hook
  detection; one end-to-end smoke test over `tests/fixtures/sample.mp4`.
- `media/` — real source/exports from assisted manual runs (no longer in DB).
- Dashboard screenshots under `/tmp` and prior session frames show the
  incumbent dashboard visual language (Next.js + Tailwind, blue accent).

## Product Principles

1. The link-in / clips-out promise must survive first contact — settings that
   read like a video engineer's config sheet are a launch blocker.
2. Technical capability stays available but only behind an explicit Advanced
   layer; defaults must produce good output untouched.
3. Everything the UI offers must actually drive the pipeline — a control that
   changes no behavior is a defect.
4. Local-first and deterministic: no data leaves the machine, same input
   produces same output.

## Accessibility & Inclusion

No product-specific requirement established beyond standard web accessibility
(keyboard-operable controls, sufficient contrast, non-color-only signaling).
