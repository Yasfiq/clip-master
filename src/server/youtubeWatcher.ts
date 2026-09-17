import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { PATHS } from './paths';
import { logger } from './logger';
import { db } from './db';
import { JobStatus } from '@prisma/client';
import { jobService } from './services/jobService';
import { MonitoredChannel, DetectedVideo, YouTubeWatcherStatus } from '../types/youtubeWatcher';

export interface TargetChannel {
  id: string;
  name: string;
  handle?: string;
  channelId: string;
  addedAt: string;
  lastChecked?: string;
}

export interface WatcherHistoryItem {
  videoId: string;
  title: string;
  channelName: string;
  channelId: string;
  detectedAt: string;
  jobId?: string;
  jobStatus?: string;
}

export interface YouTubeFeedEntry {
  videoId: string;
  title: string;
  channelName: string;
  channelId: string;
  publishedAt: string;
  videoUrl: string;
}

const CHANNELS_FILE_NAME = 'youtube_channels.json';
const HISTORY_FILE_NAME = 'youtube_watcher_history.json';

let isWatcherActive = false;
let isPollingRunning = false;
let watcherIntervalMs = 15 * 60 * 1000;
let watcherTimer: NodeJS.Timeout | null = null;
let lastPollTimestamp: string | null = null;

// Cached in-memory channels and history
let cachedChannels: TargetChannel[] = [];
let cachedHistory: WatcherHistoryItem[] = [];

function getChannelsFilePath(customPath?: string): string {
  return customPath || path.join(PATHS.media, CHANNELS_FILE_NAME);
}

function getHistoryFilePath(customPath?: string): string {
  return customPath || path.join(PATHS.media, HISTORY_FILE_NAME);
}

async function loadDataFromDisk(channelsPath?: string, historyPath?: string): Promise<void> {
  try {
    const cPath = getChannelsFilePath(channelsPath);
    const data = await fs.readFile(cPath, 'utf-8');
    cachedChannels = JSON.parse(data);
  } catch {
    // Keep cachedChannels
  }

  try {
    const hPath = getHistoryFilePath(historyPath);
    const data = await fs.readFile(hPath, 'utf-8');
    cachedHistory = JSON.parse(data);
  } catch {
    // Keep cachedHistory
  }
}

// Initial load
loadDataFromDisk().catch(() => {});

/**
 * Decode XML entities and strip CDATA wrappers.
 */
export function decodeXmlEntities(input: string): string {
  if (!input) return '';
  let str = input.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Parse standard Atom XML feed returned by YouTube.
 */
export function parseYouTubeRssXml(xml: string): YouTubeFeedEntry[] {
  if (!xml || typeof xml !== 'string') return [];

  const feedChannelIdMatch = xml.match(/<yt:channelId>([^<]+)<\/yt:channelId>/i);
  const feedFallbackChannelId = feedChannelIdMatch
    ? decodeXmlEntities(feedChannelIdMatch[1].trim())
    : '';

  const feedTitleMatch = xml.match(/<title>([^<]+)<\/title>/i);
  const feedFallbackTitle = feedTitleMatch ? decodeXmlEntities(feedTitleMatch[1].trim()) : '';

  const feedAuthorMatch = xml.match(/<author>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/author>/i);
  const feedFallbackAuthor = feedAuthorMatch
    ? decodeXmlEntities(feedAuthorMatch[1].trim())
    : feedFallbackTitle;

  const entries: YouTubeFeedEntry[] = [];
  const entryMatches = xml.match(/<entry>[\s\S]*?<\/entry>/gi);
  if (!entryMatches) return [];

  for (const entryStr of entryMatches) {
    const videoIdMatch = entryStr.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i);
    if (!videoIdMatch) continue;
    const videoId = videoIdMatch[1].trim();

    const titleMatch = entryStr.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : '';

    const authorMatch = entryStr.match(
      /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i,
    );
    const channelName = authorMatch
      ? decodeXmlEntities(authorMatch[1].trim())
      : feedFallbackAuthor || 'YouTube Creator';

    const channelIdMatch = entryStr.match(/<yt:channelId>([^<]+)<\/yt:channelId>/i);
    const channelId = channelIdMatch ? channelIdMatch[1].trim() : feedFallbackChannelId;

    const publishedMatch = entryStr.match(/<published>([^<]+)<\/published>/i);
    const publishedAt = publishedMatch ? publishedMatch[1].trim() : new Date().toISOString();

    const linkMatch = entryStr.match(/<link[^>]+href="([^"]+)"[^>]*\/?>/i);
    const videoUrl = linkMatch ? linkMatch[1] : `https://www.youtube.com/watch?v=${videoId}`;

    entries.push({
      videoId,
      title,
      channelName,
      channelId,
      publishedAt,
      videoUrl,
    });
  }

  return entries;
}

/**
 * Build canonical YouTube RSS feed URL from channel ID.
 */
export function buildRssFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

/**
 * Parse and classify channel input (ID, URL, or @handle).
 */
export function parseYouTubeChannelInput(input: string): {
  type: 'channelId' | 'handle';
  value: string;
} {
  const trimmed = input.trim();

  // RSS URL
  const rssMatch = trimmed.match(/[?&]channel_id=([a-zA-Z0-9_-]+)/i);
  if (rssMatch) {
    return { type: 'channelId', value: rssMatch[1] };
  }

  // Channel URL: youtube.com/channel/UC...
  const channelUrlMatch = trimmed.match(/(?:youtube\.com\/channel\/)(UC[a-zA-Z0-9_-]+)/i);
  if (channelUrlMatch) {
    return { type: 'channelId', value: channelUrlMatch[1] };
  }

  // Bare channel ID starting with UC
  if (/^UC[a-zA-Z0-9_-]{20,24}$/.test(trimmed)) {
    return { type: 'channelId', value: trimmed };
  }

  // Handle with or without URL
  const handleUrlMatch = trimmed.match(/(?:youtube\.com\/)?(@[a-zA-Z0-9_.-]+)/i);
  if (handleUrlMatch) {
    return { type: 'handle', value: handleUrlMatch[1] };
  }

  if (trimmed.startsWith('@')) {
    return { type: 'handle', value: trimmed };
  }

  // Fallback: treated as handle
  return { type: 'handle', value: `@${trimmed}` };
}

/**
 * Resolve channel ID from HTML scraped from YouTube channel page.
 */
export function resolveChannelIdFromHtml(html: string): string | null {
  if (!html) return null;

  const itempropMatch = html.match(/<meta\s+itemprop="channelId"\s+content="([^"]+)"/i);
  if (itempropMatch) return itempropMatch[1];

  const externalIdMatch = html.match(/"externalId"\s*:\s*"([^"]+)"/i);
  if (externalIdMatch) return externalIdMatch[1];

  const browseIdMatch = html.match(/"browseId"\s*:\s*"(UC[^"]+)"/i);
  if (browseIdMatch) return browseIdMatch[1];

  const canonicalMatch = html.match(
    /<link\s+rel="canonical"\s+href="https:\/\/(?:www\.)?youtube\.com\/channel\/([^"]+)"/i,
  );
  if (canonicalMatch) return canonicalMatch[1];

  return null;
}

/**
 * Resolve channel title from HTML page.
 */
export function resolveChannelTitleFromHtml(html: string): string | null {
  if (!html) return null;

  const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (ogTitleMatch) return decodeXmlEntities(ogTitleMatch[1]);

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const raw = decodeXmlEntities(titleMatch[1].trim());
    return raw.replace(/\s*-\s*YouTube$/i, '').trim();
  }

  return null;
}

/**
 * Resolve YouTube handle or channel ID into metadata and RSS URL.
 */
export async function resolveYouTubeChannel(
  input: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ channelId: string; name: string; handle?: string; feedUrl: string }> {
  const parsed = parseYouTubeChannelInput(input);

  if (parsed.type === 'channelId') {
    const channelId = parsed.value;
    const feedUrl = buildRssFeedUrl(channelId);
    let name = channelId;

    try {
      const res = await fetchFn(feedUrl);
      if (res.ok) {
        const xml = await res.text();
        const feedTitleMatch = xml.match(/<title>([^<]+)<\/title>/i);
        if (feedTitleMatch) {
          name = decodeXmlEntities(feedTitleMatch[1].trim());
        }
      }
    } catch {}

    return {
      channelId,
      name,
      handle: input.startsWith('@') ? input : undefined,
      feedUrl,
    };
  }

  const handle = parsed.value;
  const pageUrl = `https://www.youtube.com/${handle}`;
  let res: Response;
  try {
    res = await fetchFn(pageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
  } catch (err: any) {
    throw new Error(`Failed to fetch YouTube page for handle ${handle}: ${err.message}`);
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch YouTube page for handle ${handle}: HTTP ${res.status}`);
  }

  const html = await res.text();
  const channelId = resolveChannelIdFromHtml(html);
  if (!channelId) {
    throw new Error(`Failed to extract channelId for handle ${handle}`);
  }

  const name = resolveChannelTitleFromHtml(html) || handle;
  return {
    channelId,
    name,
    handle,
    feedUrl: buildRssFeedUrl(channelId),
  };
}

/**
 * Format channel handle and clean name (UI helper).
 */
export function formatChannelInput(
  input: string,
  customName?: string,
): { handleOrUrl: string; name: string } {
  const parsed = parseYouTubeChannelInput(input);
  const handleOrUrl = parsed.value;
  let name = customName?.trim() || '';

  if (!name) {
    name =
      handleOrUrl
        .replace(/^@/, '')
        .replace(/([A-Z])/g, ' $1')
        .trim() || handleOrUrl;
  }

  return { handleOrUrl, name };
}

/**
 * Add a channel to monitored list.
 */
export async function addYouTubeChannel(
  input: string,
  options?: {
    channelsPath?: string;
    historyPath?: string;
    fetchFn?: typeof fetch;
    name?: string;
  },
): Promise<TargetChannel> {
  const channelsFile = getChannelsFilePath(options?.channelsPath);
  const resolved = await resolveYouTubeChannel(input, options?.fetchFn);

  let channels: TargetChannel[] = [];
  try {
    const raw = await fs.readFile(channelsFile, 'utf-8');
    channels = JSON.parse(raw);
  } catch {
    channels = [...cachedChannels];
  }

  const existing = channels.find((c) => c.channelId === resolved.channelId);
  if (existing) {
    return existing;
  }

  const newChannel: TargetChannel = {
    id: `chan_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
    name: options?.name || resolved.name,
    handle: resolved.handle,
    channelId: resolved.channelId,
    addedAt: new Date().toISOString(),
  };

  channels.push(newChannel);
  cachedChannels = channels;

  await fs.mkdir(path.dirname(channelsFile), { recursive: true });
  await fs.writeFile(channelsFile, JSON.stringify(channels, null, 2), 'utf-8');
  logger.info(`YouTube Channel added: ${newChannel.name} (${newChannel.channelId})`);
  return newChannel;
}

export async function addMonitoredChannel(
  rawInput: string,
  name?: string,
): Promise<MonitoredChannel> {
  const added = await addYouTubeChannel(rawInput, { name });
  return {
    id: added.id,
    name: added.name,
    handleOrUrl: added.handle || added.channelId,
    status: 'idle',
    createdAt: added.addedAt,
    lastCheckedAt: added.lastChecked,
  };
}

/**
 * Remove a channel from monitored list.
 */
export async function removeYouTubeChannel(
  idOrChannelIdOrHandle: string,
  options?: {
    channelsPath?: string;
    historyPath?: string;
  },
): Promise<boolean> {
  const channelsFile = getChannelsFilePath(options?.channelsPath);
  let channels: TargetChannel[] = [];
  try {
    const raw = await fs.readFile(channelsFile, 'utf-8');
    channels = JSON.parse(raw);
  } catch {
    channels = [...cachedChannels];
  }

  const initialCount = channels.length;
  const target = idOrChannelIdOrHandle.toLowerCase();
  channels = channels.filter(
    (c) =>
      c.id.toLowerCase() !== target &&
      c.channelId.toLowerCase() !== target &&
      c.handle?.toLowerCase() !== target,
  );

  if (channels.length === initialCount) {
    return false;
  }

  cachedChannels = channels;
  await fs.mkdir(path.dirname(channelsFile), { recursive: true });
  await fs.writeFile(channelsFile, JSON.stringify(channels, null, 2), 'utf-8');
  logger.info(`YouTube Channel removed: ${idOrChannelIdOrHandle}`);
  return true;
}

export async function removeMonitoredChannel(id: string): Promise<boolean> {
  return removeYouTubeChannel(id);
}

/**
 * Poll feeds for all monitored channels, creating PENDING jobs for new videos.
 */
export async function pollYouTubeFeeds(options?: {
  channelsPath?: string;
  historyPath?: string;
  fetchFn?: typeof fetch;
  autoStartJob?: boolean;
}): Promise<{ newlyDetectedCount: number; jobsCreated: string[] }> {
  if (isPollingRunning) {
    return { newlyDetectedCount: 0, jobsCreated: [] };
  }

  isPollingRunning = true;
  const channelsFile = getChannelsFilePath(options?.channelsPath);
  const historyFile = getHistoryFilePath(options?.historyPath);
  const fetchFn = options?.fetchFn || fetch;
  const autoStart = options?.autoStartJob !== false;

  let channels: TargetChannel[] = [];
  try {
    const raw = await fs.readFile(channelsFile, 'utf-8');
    channels = JSON.parse(raw);
    cachedChannels = channels;
  } catch {
    channels = [...cachedChannels];
  }

  let history: WatcherHistoryItem[] = [];
  try {
    const raw = await fs.readFile(historyFile, 'utf-8');
    history = JSON.parse(raw);
    cachedHistory = history;
  } catch {
    history = [...cachedHistory];
  }

  const knownVideoIds = new Set(history.map((h) => h.videoId));
  const jobsCreated: string[] = [];
  let newlyDetectedCount = 0;

  try {
    for (const ch of channels) {
      try {
        const feedUrl = buildRssFeedUrl(ch.channelId);
        const res = await fetchFn(feedUrl);
        if (!res.ok) continue;

        const xml = await res.text();
        const entries = parseYouTubeRssXml(xml);

        let config = await db.pipelineConfig.findFirst();
        if (!config) {
          config = await db.pipelineConfig.create({
            data: { name: 'Default' },
          });
        }

        for (const entry of entries) {
          if (knownVideoIds.has(entry.videoId)) continue;

          knownVideoIds.add(entry.videoId);
          newlyDetectedCount++;

          const job = await db.job.create({
            data: {
              sourceUrl: entry.videoUrl,
              sourceTitle: entry.title,
              sourceChannel: entry.channelName || ch.name,
              status: JobStatus.PENDING,
              configId: config.id,
            },
          });

          jobsCreated.push(job.id);

          history.unshift({
            videoId: entry.videoId,
            title: entry.title,
            channelName: entry.channelName || ch.name,
            channelId: ch.channelId,
            detectedAt: new Date().toISOString(),
            jobId: job.id,
            jobStatus: 'PENDING',
          });

          if (autoStart) {
            jobService.startJob(job.id).catch((err: any) => {
              logger.error(`Failed to auto-start YouTube job ${job.id}: ${err.message}`);
            });
          }
        }

        ch.lastChecked = new Date().toISOString();
      } catch (err: any) {
        logger.error(`Error polling feed for channel ${ch.name}: ${err.message}`);
      }
    }

    lastPollTimestamp = new Date().toISOString();
    cachedHistory = history;

    if (newlyDetectedCount > 0) {
      await fs.mkdir(path.dirname(historyFile), { recursive: true });
      await fs.writeFile(historyFile, JSON.stringify(history, null, 2), 'utf-8');
    }

    if (channels.length > 0) {
      await fs.mkdir(path.dirname(channelsFile), { recursive: true });
      await fs.writeFile(channelsFile, JSON.stringify(channels, null, 2), 'utf-8');
    }
  } finally {
    isPollingRunning = false;
  }

  return { newlyDetectedCount, jobsCreated };
}

export async function pollYouTubeChannelsNow(): Promise<YouTubeWatcherStatus> {
  await pollYouTubeFeeds();
  return getYouTubeWatcherStatus();
}

/**
 * Start daemon background polling.
 */
export async function startYouTubeWatcher(options?: {
  pollIntervalMs?: number;
  channelsPath?: string;
  historyPath?: string;
  fetchFn?: typeof fetch;
}): Promise<void> {
  if (options?.pollIntervalMs) {
    watcherIntervalMs = options.pollIntervalMs;
  }
  isWatcherActive = true;
  if (watcherTimer) clearInterval(watcherTimer);

  watcherTimer = setInterval(() => {
    if (isWatcherActive) {
      pollYouTubeFeeds(options).catch((err) => {
        logger.error(`YouTube watcher periodic poll error: ${err.message}`);
      });
    }
  }, watcherIntervalMs);

  logger.info(`YouTube Watcher started (interval: ${watcherIntervalMs}ms)`);
}

export async function stopYouTubeWatcher(): Promise<void> {
  isWatcherActive = false;
  if (watcherTimer) {
    clearInterval(watcherTimer);
    watcherTimer = null;
  }
  logger.info('YouTube Watcher stopped');
}

export function isYouTubeWatcherActive(): boolean {
  return isWatcherActive;
}

export const isYoutubeWatcherActive = isYouTubeWatcherActive;

export async function setYoutubeWatcherActive(active: boolean): Promise<YouTubeWatcherStatus> {
  if (active) {
    await startYouTubeWatcher();
  } else {
    await stopYouTubeWatcher();
  }
  return getYouTubeWatcherStatus();
}

export async function toggleYoutubeWatcher(): Promise<YouTubeWatcherStatus> {
  return setYoutubeWatcherActive(!isWatcherActive);
}

/**
 * Get unified watcher status for API, WebUI, and unit tests.
 */
export function getYouTubeWatcherStatus(): YouTubeWatcherStatus & {
  pollIntervalMs: number;
  history: WatcherHistoryItem[];
} {
  const channels: MonitoredChannel[] = cachedChannels.map((c) => ({
    id: c.id,
    name: c.name,
    handleOrUrl: c.handle || c.channelId,
    status: isWatcherActive ? 'active' : 'idle',
    lastCheckedAt: c.lastChecked,
    createdAt: c.addedAt,
  }));

  const detectedVideos: DetectedVideo[] = cachedHistory.map((h) => ({
    id: `det_${h.videoId}`,
    title: h.title,
    channelName: h.channelName,
    channelHandle: h.channelId,
    videoUrl: `https://www.youtube.com/watch?v=${h.videoId}`,
    videoId: h.videoId,
    detectedAt: h.detectedAt,
    jobId: h.jobId,
    jobStatus: h.jobStatus || 'PENDING',
  }));

  return {
    active: isWatcherActive,
    isPolling: isPollingRunning,
    pollIntervalMs: watcherIntervalMs,
    pollIntervalMinutes: Math.round(watcherIntervalMs / 60000),
    lastPollAt: lastPollTimestamp,
    channels,
    detectedVideos,
    history: [...cachedHistory],
  };
}

export const getYoutubeWatcherStatus = getYouTubeWatcherStatus;

/**
 * Initialize watcher at Next.js server startup.
 */
export async function initYouTubeWatcher(): Promise<void> {
  if (process.env.DISABLE_YOUTUBE_WATCHER === 'true') {
    logger.info('YouTube Watcher initialization bypassed (DISABLE_YOUTUBE_WATCHER=true)');
    return;
  }
  await loadDataFromDisk();
  // We keep it ready, optionally starting if configured
  logger.info('YouTube Watcher initialized successfully');
}

/**
 * Reset internal state for test cleanups.
 */
export async function _resetYouTubeWatcherStateForTesting(): Promise<void> {
  await stopYouTubeWatcher();
  isPollingRunning = false;
  isWatcherActive = false;
  watcherIntervalMs = 15 * 60 * 1000;
  lastPollTimestamp = null;
  cachedChannels = [];
  cachedHistory = [];
}

export const _resetYouTubeWatcherForTesting = _resetYouTubeWatcherStateForTesting;
