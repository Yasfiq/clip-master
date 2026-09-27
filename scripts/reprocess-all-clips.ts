import { reBurnClipSubtitles } from '../src/pipeline/stages/reBurn';
import { db } from '../src/server/db';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const JOB_ID = 'cmtzq4qfz0003n481rs3igc2f';
const SRC = 'media/sources/raditya_dika_satu_jam.mp4';

async function reprocess() {
  const clips = await db.clip.findMany({
    where: { jobId: JOB_ID },
    orderBy: { startTime: 'asc' },
  });

  console.log(
    `Found ${clips.length} clips to update with top-right source pill and frame-accurate sync...`,
  );

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const cutPath = path.join('media/work', JOB_ID, 'cuts', `${clip.id}_raw.mp4`);
    const editedPath = path.join('media/work', JOB_ID, 'edited', `${clip.id}_edited.mp4`);
    const dur = clip.endTime - clip.startTime;

    console.log(
      `\nRe-cutting clip ${i + 1}/${clips.length}: ${clip.id} (${clip.startTime}s - ${clip.endTime}s)...`,
    );
    execSync(
      `ffmpeg -y -ss ${clip.startTime} -i "${SRC}" -t ${dur} -c:v libx264 -preset ultrafast -crf 18 -c:a aac -b:a 192k -avoid_negative_ts make_zero "${cutPath}"`,
    );
    fs.copyFileSync(cutPath, editedPath);

    console.log(`Re-burning clip ${clip.id}...`);
    const res = await reBurnClipSubtitles(clip.id, 'clipajaib', {
      hookText: clip.hookHeadline || '',
      hookPosition: 'top',
      freezeDuration: 0,
      subtitleDelay: 0,
      sourceText: 'Sumber: Raditya Dika',
      sourceEnabled: true,
      sourcePosition: 'top-right',
      logoEnabled: true,
      logoPosition: 'top-left',
      logoPath: 'media/assets/logo.png',
    });
    console.log(
      `Done clip ${clip.id}:`,
      res.exportPath,
      `${(res.fileSize / 1024 / 1024).toFixed(1)} MB`,
    );
  }

  console.log('\nAll clips updated successfully with top-right source and perfect sync!');
}

reprocess().catch((err) => {
  console.error('Reprocess failed:', err);
  process.exit(1);
});
