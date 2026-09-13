import { db } from '../src/server/db';
import { JobStatus } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { parseSrt } from '../src/pipeline/logic/srtParser';

const BASE_URL = 'http://127.0.0.1:3000';
const YOUTUBE_URL = 'https://youtu.be/sD5TqyFOt0Y?si=g8RIvHbP6oxle8I0';

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runE2E() {
  console.log('=== STEP 1: Creating fresh job ===');
  const createRes = await fetch(`${BASE_URL}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceUrl: YOUTUBE_URL,
    }),
  });

  const createPayload: any = await createRes.json();
  if (!createPayload.success) {
    throw new Error(`Failed to create job: ${JSON.stringify(createPayload)}`);
  }

  const job = createPayload.data;
  const jobId = job.id;
  console.log(`Job created: ${jobId}`);

  console.log('\n=== STEP 2: Starting Phase 1 ===');
  const startRes = await fetch(`${BASE_URL}/api/jobs/${jobId}?action=start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'start' }),
  });
  const startPayload: any = await startRes.json();
  if (!startPayload.success) {
    throw new Error(`Failed to start job: ${JSON.stringify(startPayload)}`);
  }
  console.log(`Job started, status: ${startPayload.data.status}`);

  console.log(
    '\n=== STEP 3: Waiting for Phase 1 to complete (DISCOVER -> TRANSCRIBE -> ANALYZE -> CUT) ===',
  );
  let phase1Done = false;
  let attempts = 0;
  while (!phase1Done && attempts < 250) {
    await delay(3000);
    attempts++;
    const currentJob = await db.job.findUnique({ where: { id: jobId } });
    if (!currentJob) throw new Error('Job disappeared from DB');

    console.log(
      `[${attempts * 3}s] Status: ${currentJob.status} | Stage: ${currentJob.currentStage} | Progress: ${(
        (currentJob.progress || 0) * 100
      ).toFixed(1)}%`,
    );

    if (currentJob.status === JobStatus.PHASE1_DONE) {
      phase1Done = true;
      break;
    }
    if (currentJob.status === JobStatus.FAILED || currentJob.status === JobStatus.CANCELLED) {
      throw new Error(`Job failed during Phase 1: ${currentJob.errorMessage}`);
    }
  }

  if (!phase1Done) {
    throw new Error('Timeout waiting for Phase 1');
  }

  const clipsPhase1 = await db.clip.findMany({
    where: { jobId },
    orderBy: { startTime: 'asc' },
  });
  console.log(`\nPhase 1 completed! Extracted ${clipsPhase1.length} viral clips:`);
  for (const [idx, c] of clipsPhase1.entries()) {
    console.log(
      `  Clip #${idx + 1}: ${c.id} | [${c.startTime}s - ${c.endTime}s] (${c.duration.toFixed(
        1,
      )}s) | Score: ${c.viralScore?.toFixed(3)} (${c.confidence}) | Hook: "${c.hookHeadline}"`,
    );
  }

  console.log('\n=== STEP 4: Starting Phase 2 (EDIT -> SUBTITLE -> EXPORT -> COMPRESS) ===');
  const phase2Res = await fetch(`${BASE_URL}/api/jobs/${jobId}/phase2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const phase2Payload: any = await phase2Res.json();
  if (!phase2Payload.success) {
    throw new Error(`Failed to start Phase 2: ${JSON.stringify(phase2Payload)}`);
  }
  console.log(`Phase 2 started, status: ${phase2Payload.data.status}`);

  let phase2Done = false;
  let p2Attempts = 0;
  while (!phase2Done && p2Attempts < 250) {
    await delay(5000);
    p2Attempts++;
    const currentJob = await db.job.findUnique({ where: { id: jobId } });
    if (!currentJob) throw new Error('Job disappeared from DB');

    console.log(
      `[${p2Attempts * 5}s] Status: ${currentJob.status} | Stage: ${currentJob.currentStage} | Progress: ${(
        (currentJob.progress || 0) * 100
      ).toFixed(1)}%`,
    );

    if (currentJob.status === JobStatus.COMPLETED) {
      phase2Done = true;
      break;
    }
    if (currentJob.status === JobStatus.FAILED || currentJob.status === JobStatus.CANCELLED) {
      throw new Error(`Job failed during Phase 2: ${currentJob.errorMessage}`);
    }
  }

  if (!phase2Done) {
    throw new Error('Timeout waiting for Phase 2');
  }

  console.log('\n=== STEP 5: Verifying completed job and exported clips ===');
  const completedClips = await db.clip.findMany({
    where: { jobId },
    orderBy: { startTime: 'asc' },
  });

  console.log(`Total completed clips: ${completedClips.length}`);
  let anomalyCount = 0;

  for (const [idx, c] of completedClips.entries()) {
    console.log(`\n--- Auditing Clip #${idx + 1} (${c.id}) ---`);
    if (!c.exportPath) {
      console.error(`ANOMALY: Clip ${c.id} has no exportPath!`);
      anomalyCount++;
      continue;
    }

    const fullExportPath = path.join('media/exports', path.basename(c.exportPath));
    if (!fs.existsSync(fullExportPath)) {
      console.error(`ANOMALY: Export file missing on disk: ${fullExportPath}`);
      anomalyCount++;
      continue;
    }

    const stat = fs.statSync(fullExportPath);
    console.log(`Export file exists: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
    if (stat.size < 500_000) {
      console.error(`ANOMALY: Export file size suspiciously small: ${stat.size} bytes`);
      anomalyCount++;
    }

    // FFprobe check
    try {
      const probeJson = execSync(
        `ffprobe -v error -show_entries stream=width,height,codec_name -show_entries format=duration -of json "${fullExportPath}"`,
      ).toString();
      const probe = JSON.parse(probeJson);
      const videoStream = probe.streams?.find((s: any) => s.codec_name === 'h264');
      const audioStream = probe.streams?.find(
        (s: any) => s.codec_name === 'aac' || s.codec_name === 'mp3',
      );
      const duration = parseFloat(probe.format?.duration || '0');

      console.log(
        `FFprobe: ${videoStream?.width}x${videoStream?.height}, duration: ${duration.toFixed(1)}s, audio: ${audioStream?.codec_name}`,
      );
      if (videoStream?.width !== 1080 || videoStream?.height !== 1920) {
        console.error(
          `ANOMALY: Resolution is not 1080x1920! Got ${videoStream?.width}x${videoStream?.height}`,
        );
        anomalyCount++;
      }
      if (!audioStream) {
        console.error(`ANOMALY: Audio stream missing!`);
        anomalyCount++;
      }
    } catch (err: any) {
      console.error(`ANOMALY: FFprobe failed: ${err.message}`);
      anomalyCount++;
    }

    // Subtitle check
    const srtPath = fullExportPath.replace(/\.mp4$/, '.srt');
    if (fs.existsSync(srtPath)) {
      const srtContent = fs.readFileSync(srtPath, 'utf-8');
      const cues = parseSrt(srtContent);
      console.log(`SRT sidecar found: ${cues.length} cues`);
      let maxWordsInCue = 0;
      let violatingCue: any = null;
      for (const cue of cues) {
        const words = cue.text.trim().split(/\s+/).filter(Boolean);
        if (words.length > maxWordsInCue) {
          maxWordsInCue = words.length;
        }
        if (words.length > 3) {
          violatingCue = cue;
          break;
        }
      }

      if (violatingCue) {
        console.error(
          `ANOMALY: Subtitle cue exceeds 3 words! "${violatingCue.text}" (${violatingCue.text.split(/\s+/).length} words)`,
        );
        anomalyCount++;
      } else {
        console.log(
          `Subtitle invariant verified: 100% of cues have <= 3 words (max: ${maxWordsInCue})`,
        );
      }
    } else {
      console.log(`Note: No sidecar SRT at ${srtPath} (subtitles burned into video stream)`);
    }
  }

  // Visual frame extraction for review
  if (completedClips.length > 0 && completedClips[0].exportPath) {
    const firstExport = path.join('media/exports', path.basename(completedClips[0].exportPath));
    const frameOut =
      '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81/audit_e2e_final_clip0.png';
    try {
      execSync(`ffmpeg -ss 15 -i "${firstExport}" -vframes 1 -q:v 2 -y "${frameOut}"`);
      console.log(`Audit frame extracted: ${frameOut}`);
    } catch (e: any) {
      console.warn(`Could not extract frame: ${e.message}`);
    }
  }

  console.log(`\n=== AUDIT SUMMARY ===`);
  console.log(`Total Clips Produced: ${completedClips.length}`);
  console.log(`Anomalies Detected: ${anomalyCount}`);
  if (anomalyCount > 0) {
    throw new Error(`E2E Audit failed with ${anomalyCount} anomalies`);
  }
  console.log(`E2E Test PASSED flawlessly with 0 anomalies! Job ID: ${jobId}`);
}

runE2E().catch((err) => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
