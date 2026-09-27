# Tasks Backlog: Refactor ClipStudioModal Monolith

## Overview

Decompose `src/components/ClipStudioModal.tsx` (~2098 lines) into atomic custom hooks and compound UI components without breaking existing contract or behavior.

---

### Task 1: Extract Logic to Custom Hooks

- [x] Create `src/hooks/useSubtitleEditor.ts` (SRT cue state, text edit, nudge all/single, add/remove cues).
- [x] Create `src/hooks/useTtsPreview.ts` (TTS audio preview, audio playback, status/loading state).
- [x] Create `src/hooks/useStudioConfig.ts` (fetching studio metadata, saving draft, re-burn studio video, logo uploads).
- [x] Create `src/hooks/useVideoPlayer.ts` (video timeline, seek, freeze frame animation loop, keyboard shortcuts, metadata load).
- [x] Typecheck with `npx tsc --noEmit`.

**Status:** [x] Done

---

### Task 2: Extract Tab Panels

- [x] Create `src/components/studio/panels/SubtitlePanel.tsx`.
- [x] Create `src/components/studio/panels/HookPanel.tsx`.
- [x] Create `src/components/studio/panels/BrandingPanel.tsx`.
- [x] Create `src/components/studio/panels/TransitionPanel.tsx`.
- [x] Create `src/components/studio/panels/AudioPanel.tsx`.
- [x] Typecheck with `npx tsc --noEmit`.

**Status:** [x] Done

---

### Task 3: Extract Shell, Canvas, and Timeline Components

- [x] Create `src/components/studio/StudioHeader.tsx`.
- [x] Create `src/components/studio/StudioCanvas.tsx`.
- [x] Create `src/components/studio/StudioInspector.tsx`.
- [x] Create `src/components/studio/StudioTimeline.tsx`.
- [x] Create `src/components/studio/StudioSidebarNav.tsx`.
- [x] Typecheck with `npx tsc --noEmit`.

**Status:** [x] Done

---

### Task 4: Reassemble ClipStudioModal

- [x] Refactor `src/components/ClipStudioModal.tsx` to orchestrate custom hooks and studio components.
- [x] Keep backwards compatibility (`ClipStudioModalProps`).
- [x] Verify line count drops under 400 lines (actual: 345 lines).
- [x] Build validation with `npm run build` and tests with `vitest`.

**Status:** [x] Done
