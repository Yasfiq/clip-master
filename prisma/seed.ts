import { db } from '../src/server/db';

async function main() {
  console.log('Seeding default pipeline config...');

  const defaultConfig = await db.pipelineConfig.upsert({
    where: { name: 'default' },
    update: {},
    create: {
      name: 'default',
      description: 'Default MVP configuration for Clip Master',
      isDefault: true,
      adFilterEnabled: true,
      adScoreThreshold: 0.75,
      minSegmentDuration: 120.0,
      maxSegmentDuration: 300.0,
      targetDuration: 180.0,
      mergeThreshold: 120.0,
      gradingPreset: 'NATURAL',
      duckThreshold: -24.0,
      duckRatio: 0.5,
      duckLevel: 2.0,
      subtitleEnabled: true,
      subtitleLang: 'id',
      maxLineLength: 42,
      maxLines: 2,
      minDuration: 1.0,
      maxDuration: 7.0,
      videoBitrate: 'crf=21',
      audioBitrate: '192k',
      targetResolution: '1920x1080',
      audioCodec: 'aac',
      videoCodec: 'libx264',
      h264Preset: 'medium',
      keyframeInterval: 48,
      fastStart: true,
    },
  });

  console.log('✓ Default config created:', defaultConfig.id);
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
