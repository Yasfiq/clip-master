import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(path.dirname(path.dirname(__filename)));

export const PATHS = {
  root: __dirname,
  media: path.join(__dirname, process.env.MEDIA_ROOT || './media'),
  sources: path.join(__dirname, process.env.MEDIA_SOURCES || './media/sources'),
  work: path.join(__dirname, process.env.MEDIA_WORK || './media/work'),
  exports: path.join(__dirname, process.env.MEDIA_EXPORTS || './media/exports'),
  assets: path.join(__dirname, process.env.MEDIA_ASSETS || './media/assets'),
  db: path.join(__dirname, process.env.DATABASE_URL?.replace('file:', '') || './dev.db'),
};

export const BINARIES = {
  ffmpeg: process.env.FFMPEG_PATH || 'ffmpeg',
  ytdlp: process.env.YTDLP_PATH || 'yt-dlp',
  whisper: process.env.WHISPER_PATH || 'whisper',
};

export const RETENTION = {
  sourceRetentionDays: parseInt(process.env.SOURCE_RETENTION_DAYS || '7', 10),
  failedLogRetentionDays: parseInt(process.env.FAILED_LOG_RETENTION_DAYS || '30', 10),
  emergencyCleanupThresholdGb: parseInt(process.env.EMERGENCY_CLEANUP_THRESHOLD_GB || '5', 10),
};

export const CLEANUP = {
  enabled: process.env.CLEANUP_ENABLED !== 'false',
  schedule: process.env.CLEANUP_SCHEDULE || '0 3 * * *',
};

export const SERVER = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
};

export const LOGGING = {
  level: process.env.LOG_LEVEL || 'info',
  bufferSize: parseInt(process.env.LOG_BUFFER_SIZE || '5000', 10),
  sseReconnectBackoffMs: parseInt(process.env.SSE_RECONNECT_BACKOFF_MS || '1000', 10),
};
