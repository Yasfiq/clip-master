import { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { JobStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;

  // Verify job exists
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return new Response('Job not found', { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let lastTimestamp = new Date(0);
      let lastStatus = job.status;
      let isClosed = false;

      // Keep-alive ping
      const pingInterval = setInterval(() => {
        if (!isClosed) {
          try {
            controller.enqueue(new TextEncoder().encode(': ping\n\n'));
          } catch (e) {}
        }
      }, 15000);

      // Setup cleanup when client disconnects
      req.signal.addEventListener('abort', () => {
        isClosed = true;
        clearInterval(pingInterval);
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
              exportedClipsCount: true,
              errorCode: true,
            },
          });

          if (
            currentJob &&
            (currentJob.status !== lastStatus || currentJob.currentStage !== job.currentStage)
          ) {
            lastStatus = currentJob.status;
            const statusPayload = {
              type: 'status',
              status: currentJob.status,
              stage: currentJob.currentStage,
              progress: currentJob.stageProgress,
              clipsCount: currentJob.exportedClipsCount,
              errorCode: currentJob.errorCode,
            };
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(statusPayload)}\n\n`),
            );
          }

          // 2. Check for new logs
          const newLogs = await db.jobLog.findMany({
            where: { jobId, timestamp: { gt: lastTimestamp } },
            orderBy: { timestamp: 'asc' },
          });

          if (newLogs.length > 0) {
            lastTimestamp = newLogs[newLogs.length - 1].timestamp;
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
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify({ type: 'complete' })}\n\n`),
                );
                isClosed = true;
                clearInterval(pingInterval);
                try {
                  controller.close();
                } catch (e) {}
              }
            }, 2000);
            break;
          }

          // Wait before next poll
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error('SSE Error:', error);
          if (!isClosed) {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ type: 'error', message: 'Stream error' })}\n\n`,
              ),
            );
            isClosed = true;
            clearInterval(pingInterval);
            try {
              controller.close();
            } catch (e) {}
          }
          break;
        }
      }
    },
    cancel() {
      // Handled by abort signal
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
