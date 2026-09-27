# Skill: FFmpeg Pipeline & Binary Spawning

## Purpose

Standardize how FFmpeg/yt-dlp/Whisper binaries are invoked, how filter graphs are composed, and how encoding errors are handled across the Clip Master pipeline.

---

## 1. Binary Invocation Rules

### Always use `runBinaryChecked` or `runBinary` from `src/pipeline/binaries/spawn.ts`

Never import `child_process` directly in stage files. The spawn wrapper enforces:

- **Argument arrays only** — no shell strings, no template interpolation of user input into commands.
- **AbortSignal propagation** — every stage receives cancellation from orchestrator.
- **BINARY_NOT_FOUND** error class — consistent error when binary missing from PATH.
- **Stderr line streaming** — progress parsing via `onStderrLine` callback.

```typescript
// ✅ Correct
import { runBinaryChecked } from '../binaries/spawn';
const result = await runBinaryChecked('ffmpeg', ['-i', inputPath, '-c:v', 'libx264', outputPath], {
  signal: ctx.signal,
  onStderrLine: (line) => parseProgress(line),
});

// ❌ Wrong — never do this
import { spawn } from 'child_process';
spawn('ffmpeg', ['-i', inputPath, ...args], { shell: true });
```

### Timeout & Abort

- Always pass `signal` from StageContext for cancellation support.
- Set `timeoutMs` for operations with known upper bounds (e.g., ffprobe metadata: 30s).
- Long-running encodes: no timeout, rely on AbortSignal.

### Buffer Control

- For long FFmpeg runs producing megabytes of stderr, set `bufferStderr: false` and use `onStderrLine` for progress only.
- For ffprobe JSON output, keep `bufferStdout: true` (default).

---

## 2. FFmpeg Filter Graph Composition

### Architecture

Filter graphs are built in `src/pipeline/logic/` as **pure functions** that return filter strings. Stage files in `src/pipeline/stages/` consume these strings and pass them to FFmpeg via `-filter_complex`.

```
logic/colorGrade.ts      → returns filter string
logic/audioDuck.ts        → returns filter string
logic/silenceCompress.ts  → returns filter string
logic/studioFilterGraph.ts → returns full multi-layer filter_complex
         ↓
stages/edit.ts, stages/reBurn.ts, stages/compress.ts
         ↓
runBinaryChecked('ffmpeg', ['-filter_complex', filterStr, ...])
```

### Filter Graph Rules

1. **Escape all user-derived text** before embedding in drawtext filters. Use `escapeDrawText()` from `studioFilterGraph.ts`:
   - Backslashes: `\` → `\\`
   - Single quotes: `'` → `\'`
   - Colons: `:` → `\:`
   - Percentage: `%` → `\%`
   - Line breaks → spaces

2. **Never concatenate raw strings into `-filter_complex`**. Build filter chains programmatically:

```typescript
// ✅ Correct — compose filter parts then join
const filters: string[] = [];
filters.push(buildColorGradeFilter(preset));
filters.push(buildAudioDuckFilter(config));
const filterComplex = filters.join(';');

// ❌ Wrong — string interpolation of unescaped values
const filterComplex = `drawtext=text='${userTitle}':fontsize=48`;
```

3. **Audio stream handling**: always check `ctx.metadata.hasAudio` before building audio filters. Missing audio stream + audio filter = FFmpeg crash.

4. **Font paths**: use `SYSTEM_BOLD_FONT` constant (`/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`). Never hardcode other paths.

5. **Stream labeling**: use descriptive labels (`[v_graded]`, `[a_ducked]`, `[v_out]`, `[a_out]`) not single letters.

### Multi-Layer Studio Filter Graph

The `studioFilterGraph.ts` builds the "Formula Standar Baku" with 6 layers:

| Layer | Content                          | Timing         |
| ----- | -------------------------------- | -------------- |
| 0     | Film burn / fade-in              | 0–0.55s        |
| 1     | Audio duck for TTS               | 0–hookDuration |
| 2     | Center headline hook banner      | Hook region    |
| 3     | Logo + pill overlay (persistent) | Full duration  |
| 4     | Subtitle dialog (conversational) | Speech regions |
| 5     | Fade-out outro                   | Final 1.0s     |

When modifying: change ONE layer at a time. Test with a single clip before batch.

---

## 3. FFmpeg Argument Patterns

### Encoding Output

```typescript
// Standard 9:16 portrait H.264 export
const args = [
  '-i',
  inputPath,
  '-filter_complex',
  filterComplex,
  '-map',
  '[v_out]',
  '-map',
  '[a_out]',
  '-c:v',
  'libx264',
  '-preset',
  'medium',
  '-crf',
  '23',
  '-c:a',
  'aac',
  '-b:a',
  '192k',
  '-movflags',
  '+faststart',
  '-y',
  outputPath,
];
```

### Cutting (stream copy, no re-encode)

```typescript
const args = [
  '-ss',
  String(startTime),
  '-i',
  inputPath,
  '-t',
  String(duration),
  '-c',
  'copy',
  '-avoid_negative_ts',
  'make_zero',
  '-y',
  outputPath,
];
```

### FFprobe Metadata

```typescript
const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', inputPath];
```

---

## 4. Error Handling

### FFmpeg Exit Codes

- Code 0: success
- Non-zero: `runBinaryChecked` throws with last 15 lines of stderr
- Common errors to handle gracefully:
  - "No such filter" → filter graph syntax error
  - "Invalid data found" → corrupt input file
  - "does not contain any stream" → missing audio/video stream

### Recovery Pattern

```typescript
try {
  await runBinaryChecked('ffmpeg', args, { signal });
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ABORTED')) throw err; // re-throw cancellation
  // Log and mark clip as errored, continue with next clip
  clip.error = msg;
  await onProgress(progress, `Clip ${clip.id} failed: ${msg}`);
}
```

---

## 5. Checklist Before Adding FFmpeg Logic

- [ ] Filter string built by pure function in `logic/`, not inline in stage
- [ ] All user-derived text escaped via `escapeDrawText()`
- [ ] Audio stream existence checked before audio filters
- [ ] `signal` passed to `runBinaryChecked`
- [ ] `bufferStderr: false` for long encodes
- [ ] No `shell: true`, no template literals in args
- [ ] Tested with single clip before batch processing
