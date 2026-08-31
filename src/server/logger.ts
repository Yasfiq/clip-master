import { createLogger, format, transports } from 'winston';
import path from 'path';
import { PATHS } from './paths';

const { combine, timestamp, printf, colorize } = format;

const logFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
  transports: [
    new transports.Console({
      format: combine(colorize(), logFormat),
    }),
    new transports.File({
      filename: path.join(PATHS.root, 'logs', 'app.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  ],
});

export function createJobLogger(jobId: string) {
  return createLogger({
    level: 'info',
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
    transports: [
      new transports.File({
        filename: path.join(PATHS.work, jobId, 'job.log'),
        maxsize: 10 * 1024 * 1024,
        maxFiles: 1,
      }),
    ],
  });
}

export function stripSecrets(message: string): string {
  const secrets = [process.env.DATABASE_URL, ...Object.values(process.env).filter(Boolean)];
  let clean = message;
  for (const secret of secrets) {
    if (secret && secret.length > 10) {
      clean = clean.replace(secret, '[REDACTED]');
    }
  }
  return clean;
}
