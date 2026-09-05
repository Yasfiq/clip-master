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
      targetDuration: 60.0,
      maxClips: 5,
      colorGrading: 'natural',
      backsoundEnabled: true,
      subtitleEnabled: true,
      targetResolution: '1080x1920',
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
