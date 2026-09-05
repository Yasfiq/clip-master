import { jobService } from '../src/server/services/jobService';
import { db } from '../src/server/db';

async function main() {
  await db.job.update({
    where: { id: 'cmtn2fic10000fb81wcwzxviv' },
    data: { status: 'PHASE1_DONE', stageEndedAt: null },
  });
  const j = await jobService.startPhase2('cmtn2fic10000fb81wcwzxviv');
  console.log('Phase 2 status:', j.status, j.currentStage);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
