import { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { JobStatus } from '@prisma/client';
import type { JobLog } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;

  // Verify job exists
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'JOB_NOT_FOUND', message: `Job ${jobId} not found` },
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let isClosed = false;
  let pingInterval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let cursor: { timestamp: Date; id: string } | null = null; // null = nothing sent yet
      let lastStatus = job.status;
      let lastStage = job.currentStage;
      let lastProgress = job.progress;

      // Keep-alive ping
      pingInterval = setInterval(() => {
        if (!isClosed) {
          try {
            controller.enqueue(new TextEncoder().encode(': ping\n\n'));
          } catch (e) {}
        }
      }, 15000);

      // Setup cleanup when client disconnects
      req.signal.addEventListener('abort', () => {
        isClosed = true;
        if (pingInterval) clearInterval(pingInterval);
      });

      // Send initial connection success
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`),
      );

      // Main polling loop (fallback pub/sub mechanism)
      while (!isClosed) {
        try {
          // 1. Check for status changes
          const currentJob = await db.job.findUnique({
            where: { id: jobId },
            select: {
              status: true,
              currentStage: true,
              stageProgress: true,
              progress: true,
              exportedClipsCount: true,
              errorCode: true,
              errorMessage: true,
            },
          });

          if (
            currentJob &&
            (currentJob.status !== lastStatus ||
              currentJob.currentStage !== lastStage ||
              currentJob.progress !== lastProgress)
          ) {
            lastStatus = currentJob.status;
            lastStage = currentJob.currentStage;
            lastProgress = currentJob.progress;
            const statusPayload = {
              type: 'status',
              status: currentJob.status,
              stage: currentJob.currentStage,
              // Global progress 0..1 on the job row.
              progress: currentJob.progress ?? currentJob.stageProgress,
              clipsCount: currentJob.exportedClipsCount,
              errorCode: currentJob.errorCode,
              errorMessage: currentJob.errorMessage,
            };
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(statusPayload)}\n\n`),
            );
          }

          // 2. Check for new logs. The very first poll backfills the most
          //    recent 500 rows (desc, then reversed) so a reconnect replays a
          //    bounded window; the client dedupes by id. Every later poll walks
          //    FORWARD with gte + lastLogId exclusion (several rows can share a
          //    millisecond; strict `gt` would skip those siblings forever). The
          //    asc poll is capped too: with the cursor still at epoch (no logs
          //    existed at open) an uncapped asc replay would stream the whole
          //    table on a job that has since produced many logs.
          const newLogs: JobLog[] = cursor
            ? await db.jobLog.findMany({
                where: {
                  jobId,
                  OR: [
                    { timestamp: { gt: cursor.timestamp } },
                    {
                      AND: [{ timestamp: cursor.timestamp }, { id: { gt: cursor.id } }],
                    },
                  ],
                },
                orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
                take: 500,
              })
            : await db.jobLog.findMany({
                where: { jobId, timestamp: { gt: new Date(0) } },
                orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
                take: 500,
              });
          if (cursor === null) newLogs.reverse();

          if (newLogs.length > 0) {
            const last: JobLog = newLogs[newLogs.length - 1]!;
            cursor = { timestamp: last.timestamp, id: last.id };
            const logPayload = { type: 'logs', logs: newLogs };
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(logPayload)}\n\n`));
          }

          // Terminal state check - stop polling if done
          if (
            currentJob &&
            ['COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED_AD'].includes(currentJob.status)
          ) {
            // Give a short delay for final logs to flush, then end stream
            setTimeout(() => {
              if (!isClosed) {
                try {
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({ type: 'complete' })}\n\n`),
                  );
                  isClosed = true;
                  if (pingInterval) clearInterval(pingInterval);
                  controller.close();
                } catch (e) {
                  // Stream already closed or client disconnected
                }
              }
            }, 2000);
            break;
          }

          // Wait before next poll. Idle states (PHASE1_DONE pause, queued
          // PENDING) poll slowly; an active phase polls fast.
          const idle =
            !currentJob ||
            (currentJob.status !== 'RUNNING_PHASE1' && currentJob.status !== 'RUNNING_PHASE2');
          await new Promise((resolve) => setTimeout(resolve, idle ? 4000 : 1000));
        } catch (error) {
          console.error('SSE Error:', error);
          if (!isClosed) {
            try {
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`,
                ),
              );
              isClosed = true;
              if (pingInterval) clearInterval(pingInterval);
              controller.close();
            } catch (e) {}
          }
          break;
        }
      }
    },
    cancel() {
      isClosed = true;
      if (pingInterval) clearInterval(pingInterval);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
