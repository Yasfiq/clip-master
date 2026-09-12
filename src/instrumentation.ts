/**
 * Next.js instrumentation hook.
 * Runs once when the server starts (before handling any requests).
 * Used to execute recovery logic and other startup tasks.
 *
 * Reference: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server-side only (not in Edge Runtime)
    const { recoverStaleJobs } = await import('./server/recovery');
    await recoverStaleJobs();
  }
}
