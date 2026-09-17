import { NextRequest } from 'next/server';
import { apiSuccess, apiError, ErrorCode, catchApiErrors } from '@/server/api-utils';
import {
  getYoutubeWatcherStatus,
  setYoutubeWatcherActive,
  toggleYoutubeWatcher,
  addMonitoredChannel,
  removeMonitoredChannel,
  pollYouTubeChannelsNow,
} from '@/server/youtubeWatcher';

/**
 * GET /api/system/youtube-watcher
 * Returns watcher active status, polling state, monitored channels, and detected videos history.
 */
export async function GET(req: NextRequest) {
  return catchApiErrors(async () => {
    const status = getYoutubeWatcherStatus();
    return apiSuccess(status);
  }, req);
}

/**
 * POST /api/system/youtube-watcher
 * Handles toggle, manual polling, adding channels, or removing channels.
 */
export async function POST(req: NextRequest) {
  return catchApiErrors(async () => {
    const body = (await req.json().catch(() => ({}))) || {};
    const { action, active, channel, name, id, channelId } = body;

    // 1. Toggle or Set Active Status
    if (action === 'toggle') {
      const updated = await toggleYoutubeWatcher();
      return apiSuccess(updated);
    }

    if (typeof active === 'boolean') {
      const updated = await setYoutubeWatcherActive(active);
      return apiSuccess(updated);
    }

    if (action === 'start') {
      const updated = await setYoutubeWatcherActive(true);
      return apiSuccess(updated);
    }

    if (action === 'stop') {
      const updated = await setYoutubeWatcherActive(false);
      return apiSuccess(updated);
    }

    // 2. Poll Now
    if (action === 'poll_now') {
      const updated = await pollYouTubeChannelsNow();
      return apiSuccess(updated);
    }

    // 3. Add Channel
    if (action === 'add_channel' || (channel && !action)) {
      if (!channel || typeof channel !== 'string' || !channel.trim()) {
        return apiError(ErrorCode.VALIDATION_FAILED, 'URL atau handle channel YouTube wajib diisi');
      }

      try {
        await addMonitoredChannel(channel.trim(), name);
        const current = getYoutubeWatcherStatus();
        return apiSuccess(current, 201);
      } catch (err: any) {
        return apiError(ErrorCode.VALIDATION_FAILED, err.message || 'Gagal menambahkan channel');
      }
    }

    // 4. Remove Channel
    if (action === 'remove_channel') {
      const targetId = id || channelId;
      if (!targetId) {
        return apiError(ErrorCode.VALIDATION_FAILED, 'ID channel wajib disertakan');
      }
      const success = await removeMonitoredChannel(targetId);
      if (!success) {
        return apiError(
          ErrorCode.VALIDATION_FAILED,
          `Channel dengan ID ${targetId} tidak ditemukan`,
        );
      }
      const current = getYoutubeWatcherStatus();
      return apiSuccess(current);
    }

    return apiError(ErrorCode.VALIDATION_FAILED, `Aksi tidak valid: ${action || 'kosong'}`);
  }, req);
}

/**
 * DELETE /api/system/youtube-watcher?id=...
 * Deletes a monitored channel by ID.
 */
export async function DELETE(req: NextRequest) {
  return catchApiErrors(async () => {
    const { searchParams } = new URL(req.url);
    let targetId = searchParams.get('id');

    if (!targetId) {
      const body = (await req.json().catch(() => ({}))) || {};
      targetId = body.id || body.channelId;
    }

    if (!targetId) {
      return apiError(ErrorCode.VALIDATION_FAILED, 'ID channel wajib disertakan');
    }

    const removed = await removeMonitoredChannel(targetId);
    if (!removed) {
      return apiError(ErrorCode.VALIDATION_FAILED, `Channel dengan ID ${targetId} tidak ditemukan`);
    }

    const current = getYoutubeWatcherStatus();
    return apiSuccess(current);
  }, req);
}
