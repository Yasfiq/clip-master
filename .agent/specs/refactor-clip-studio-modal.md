## Feature: Refactor ClipStudioModal — Split God Component

### Problem

`ClipStudioModal.tsx` (2098 baris) campur semua logic dan UI dalam satu file. Tidak maintainable, fragile, dan melanggar component-authoring skill ceiling (400 baris).

### Solution

Pecah menjadi custom hooks (logic) + sub-components (UI) menggunakan Compound Component pattern. External API (`ClipStudioModalProps`) tidak berubah.

### Scope

- IN: extract hooks, extract sub-components, ClipStudioModal jadi shell ~200 baris
- OUT: perubahan behavior, perubahan styling, fitur baru

### Affected Files

- `src/components/ClipStudioModal.tsx` — dipecah jadi shell
- `src/components/studio/StudioHeader.tsx` — NEW: header bar
- `src/components/studio/StudioCanvas.tsx` — NEW: video player + overlay
- `src/components/studio/StudioTimeline.tsx` — NEW: NLE timeline
- `src/components/studio/panels/SubtitlePanel.tsx` — NEW
- `src/components/studio/panels/HookPanel.tsx` — NEW
- `src/components/studio/panels/BrandingPanel.tsx` — NEW
- `src/components/studio/panels/TransitionPanel.tsx` — NEW
- `src/components/studio/panels/AudioPanel.tsx` — NEW
- `src/hooks/useVideoPlayer.ts` — NEW: player state + playback
- `src/hooks/useStudioConfig.ts` — NEW: config fetch/save/re-burn API
- `src/hooks/useSubtitleEditor.ts` — NEW: cue CRUD + nudge + timing
- `src/hooks/useTtsPreview.ts` — NEW: TTS generate/play

### Data Changes

- Schema: none
- API: none
- UI: visual output identical, internal structure changed

### Acceptance Criteria

1. `ClipStudioModal.tsx` ≤ 250 baris
2. Setiap sub-component ≤ 400 baris
3. Semua hooks pure logic, tidak mengandung JSX
4. `npm run build` clean (no type errors)
5. `npm run lint` clean
6. `npm run test:unit` pass (existing tests tidak break)
7. External props interface (`ClipStudioModalProps`) tidak berubah
8. Visual output identical (manual verify)
