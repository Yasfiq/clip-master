import { db } from '../src/server/db';

async function main() {
  const j = await db.job.findFirst({ orderBy: { createdAt: 'desc' } });
  console.log('JOB:', JSON.stringify(j, null, 2));

  const clips = await db.clip.findMany({
    where: { jobId: j!.id },
    orderBy: { startTime: 'asc' },
  });
  console.log('CLIPS:', JSON.stringify(clips, null, 2));

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
