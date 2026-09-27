import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? 'file:./dev.db';
  const adapter = new PrismaBetterSqlite3({ url, timeout: 10000 });
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  // Enable WAL mode, NORMAL synchronous, and busy timeout for concurrent safety
  client.$executeRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => {});
  client.$executeRawUnsafe('PRAGMA synchronous = NORMAL;').catch(() => {});
  client.$executeRawUnsafe('PRAGMA busy_timeout = 10000;').catch(() => {});

  return client;
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
