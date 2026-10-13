# Skill: Prisma Schema & Migration Discipline

## Purpose

Standardize how database schema changes are made, migrated, and seeded in Clip Master's SQLite-backed Prisma setup.

---

## 1. Current Schema Overview

- **File**: `prisma/schema.prisma`
- **DB**: SQLite (`dev.db` at project root)
- **Models**: `Job`, `Clip`, `JobLog`, `PipelineConfig`
- **Enums**: `JobStatus`, `JobErrorCode`, `PipelineStage`
- **Client singleton**: `src/server/db.ts`
- **Seed**: `prisma/seed.ts` (via `tsx`)
- **Migrations**: `prisma/migrations/` (5 existing)

---

## 2. Migration Rules

### When to use `migrate dev` vs `db push`

| Scenario                              | Command                                | Alasan                                    |
| ------------------------------------- | -------------------------------------- | ----------------------------------------- |
| New column/model/enum value           | `npx prisma migrate dev --name <desc>` | Creates migration file, trackable in git  |
| Prototyping/experiment (will discard) | `npx prisma db push`                   | Skips migration file, faster iteration    |
| Production-like (never)               | `npx prisma migrate deploy`            | Clip Master is local-only, not applicable |

**Default**: always `migrate dev`. Only `db push` for throwaway experiments.

### Migration Naming Convention

```bash
# Pattern: <action>_<what>
npx prisma migrate dev --name add_thumbnail_column
npx prisma migrate dev --name rename_viral_score_field
npx prisma migrate dev --name add_render_queue_model
```

Existing migrations follow this pattern:

- `init`
- `add_maxclips`
- `settings_contract`
- `add_studio_workspace_columns`
- `phase_split`

### SQLite-Specific Gotchas

1. **No `ALTER COLUMN`** — SQLite cannot rename/retype columns. Prisma handles this via table recreation, but it's slow on large tables and can lose data if not careful.

2. **No native enum** — Prisma enums compile to TEXT columns with CHECK constraints. Adding a new enum value requires a migration.

3. **No concurrent writes** — SQLite is single-writer. The app already enforces one active job. Do not add concurrent write paths.

4. **JSON columns** — `Json` type maps to TEXT. Prisma serializes/deserializes automatically. Never store raw strings in a Json field.

5. **Default values** — always provide `@default()` for new non-optional columns to avoid migration failures on existing rows.

---

## 3. Schema Change Checklist

Before modifying `schema.prisma`:

- [ ] New column has `@default()` or is optional (`?`) — existing rows must survive migration
- [ ] New enum value added at the end — Prisma recreates the CHECK constraint
- [ ] No column rename/retype unless absolutely necessary (triggers table recreation)
- [ ] `@@index` added for fields used in `WHERE` or `ORDER BY` queries
- [ ] Relation `onDelete` behavior explicit (`Cascade`, `SetNull`, etc.)
- [ ] Run `npx prisma migrate dev --name <desc>` and verify migration SQL
- [ ] Run `npx prisma db seed` to confirm seed still works
- [ ] Check `src/server/services/jobService.ts` for any queries that need updating

---

## 4. Seed Idempotency

Seed script (`prisma/seed.ts`) uses `upsert` — safe to run multiple times:

```typescript
await db.pipelineConfig.upsert({
  where: { name: 'default' },
  update: {},
  create: {/* ... */},
});
```

When adding new seed data, **always use upsert pattern**. Never `create` without checking existence.

---

## 5. Prisma Client Usage

### Import

```typescript
// Always use the singleton
import { db } from '@/server/db';

// ❌ Never instantiate a new client
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient(); // Wrong
```

### Query Patterns

```typescript
// Include relations explicitly
const job = await db.job.findUnique({
  where: { id: jobId },
  include: { clips: true, config: true },
});

// Use select for partial reads (saves memory on large tables)
const jobs = await db.job.findMany({
  select: { id: true, status: true, progress: true },
  orderBy: { createdAt: 'desc' },
});

// Transactions for multi-model writes
await db.$transaction([
  db.job.update({ where: { id }, data: { status: 'COMPLETED' } }),
  db.jobLog.create({ data: { jobId: id, level: 'info', message: 'Done' } }),
]);
```

### Type Safety

- Import enums from `@prisma/client`, not string literals:

```typescript
// ✅
import { JobStatus, PipelineStage } from '@prisma/client';
await db.job.update({ where: { id }, data: { status: JobStatus.COMPLETED } });

// ❌
await db.job.update({ where: { id }, data: { status: 'COMPLETED' } });
```

---

## 6. Adding a New Model

1. Define in `schema.prisma` with all indexes and relations
2. `npx prisma migrate dev --name add_<model_name>`
3. Update seed if default data needed
4. Create service functions in `src/server/services/` (follow `jobService.ts` pattern)
5. Expose via API route if UI needs access
6. Add to ARCHITECTURE.md model list
