import { NextRequest } from 'next/server';
import { apiSuccess, catchApiErrors } from '@/server/api-utils';
import {
  getWatcherStatus,
  isWatcherActive,
  startFolderWatcher,
  stopFolderWatcher,
} from '@/server/folderWatcher';

/**
 * GET /api/system/watcher
 * Returns watcher active status, paths, supported extensions, and processed files history.
 */
export async function GET(req: NextRequest) {
  return catchApiErrors(async () => {
    const status = getWatcherStatus();
    return apiSuccess(status);
  }, req);
}

/**
 * POST /api/system/watcher
 * Toggle active/inactive status or explicitly start/stop the folder watcher daemon.
 * Body options: { active?: boolean, action?: 'start' | 'stop' | 'toggle' }
 */
export async function POST(req: NextRequest) {
  return catchApiErrors(async () => {
    const body = (await req.json().catch(() => ({}))) || {};

    let targetActive: boolean;
    if (typeof body.active === 'boolean') {
      targetActive = body.active;
    } else if (body.action === 'start') {
      targetActive = true;
    } else if (body.action === 'stop') {
      targetActive = false;
    } else {
      targetActive = !isWatcherActive();
    }

    if (targetActive) {
      await startFolderWatcher();
    } else {
      await stopFolderWatcher();
    }

    const status = getWatcherStatus();
    return apiSuccess(status);
  }, req);
}
