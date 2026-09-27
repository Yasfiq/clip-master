# Skill: Next.js App Router API Route Patterns

## Purpose

Standardize how API routes are authored in Clip Master's Next.js App Router, ensuring consistent error handling, validation, and response shape.

---

## 1. Existing API Surface

```
src/app/api/
├── jobs/
│   ├── route.ts              # GET (list) + POST (create)
│   └── [id]/
│       ├── route.ts          # GET (detail) + DELETE
│       ├── cancel/route.ts   # POST
│       ├── phase2/route.ts   # POST
│       └── logs/
│           ├── route.ts      # GET (paginated)
│           └── stream/route.ts  # GET (SSE)
├── clips/
│   ├── route.ts              # GET (list)
│   └── [id]/
│       ├── file/route.ts     # GET (binary serve)
│       ├── studio/route.ts   # PUT
│       ├── re-burn/route.ts  # POST
│       ├── subtitles/route.ts # GET + PUT
│       └── tts/route.ts      # POST
├── config/route.ts           # GET + PUT
├── settings/logo/
│   ├── route.ts              # POST (upload)
│   └── file/route.ts         # GET (serve)
└── system/status/route.ts    # GET
```

---

## 2. Response Envelope

All routes use the uniform envelope from `src/server/api-utils.ts`:

```typescript
// Success
{ "success": true, "data": <payload> }

// Error
{ "success": false, "error": { "code": "<ErrorCode>", "message": "<string>", "details": <any> } }
```

### Error Codes & HTTP Status Mapping

| ErrorCode                | HTTP Status |
| ------------------------ | ----------- |
| `VALIDATION_FAILED`      | 400         |
| `JOB_NOT_FOUND`          | 404         |
| `JOB_ALREADY_RUNNING`    | 409         |
| `JOB_NOT_READY`          | 409         |
| `PURE_AD_REJECTED`       | 500         |
| `NO_QUALIFYING_SEGMENTS` | 500         |
| `BINARY_NOT_FOUND`       | 500         |
| `STAGE_FAILED`           | 500         |
| `INTERNAL`               | 500         |

---

## 3. Route Handler Template

```typescript
import { NextRequest } from 'next/server';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { db } from '@/server/db';

/**
 * GET /api/<resource>
 * <One-line description>
 */
export async function GET(req: NextRequest) {
  return catchApiErrors(async () => {
    // 1. Parse & validate input
    const { searchParams } = req.nextUrl;
    const id = searchParams.get('id');

    if (!id) {
      return apiError(ErrorCode.VALIDATION_FAILED, 'id is required');
    }

    // 2. Business logic (call service or Prisma directly)
    const result = await db.job.findUnique({ where: { id } });

    if (!result) {
      return apiError(ErrorCode.JOB_NOT_FOUND, `Job ${id} not found`);
    }

    // 3. Return envelope
    return apiSuccess(result);
  }, req);
}
```

---

## 4. Rules

### Always use `catchApiErrors` wrapper

Every exported handler MUST be wrapped. This catches unhandled exceptions and returns a consistent `INTERNAL` error envelope instead of a raw 500.

```typescript
// ✅
export async function POST(req: NextRequest) {
  return catchApiErrors(async () => {
    // handler logic
  }, req);
}

// ❌ — unhandled throw returns raw Next.js error page
export async function POST(req: NextRequest) {
  const body = await req.json();
  // ...
}
```

### Validate at the boundary

- Parse `req.json()` with `.catch(() => ({}))` to handle malformed JSON.
- Validate required fields immediately. Return `VALIDATION_FAILED` early.
- Unknown request-body keys: **ignore, never forward** into pipeline config or DB.

```typescript
const body = (await req.json().catch(() => ({}))) || {};
const { sourceUrl, sourcePath } = body;

if (!sourceUrl && !sourcePath) {
  return apiError(ErrorCode.VALIDATION_FAILED, 'Either sourceUrl or sourcePath must be provided');
}
```

### URL scheme validation

```typescript
if (sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return apiError(ErrorCode.VALIDATION_FAILED, 'sourceUrl must use http or https scheme');
    }
  } catch {
    return apiError(ErrorCode.VALIDATION_FAILED, 'sourceUrl is not a valid URL');
  }
}
```

### No pipeline logic in route handlers

Routes are **thin handlers**. They:

1. Validate input
2. Call service (`jobService`) or orchestrator
3. Return response

They do NOT contain FFmpeg args, stage decisions, scoring logic, or file manipulation.

### Dynamic route params

Next.js App Router passes params as second argument:

```typescript
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    // ...
  }, req);
}
```

---

## 5. File Serving (Binary Response)

For serving clip files, thumbnails, logos:

```typescript
import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

// Resolve path from DB record, never from client-supplied path
const clip = await db.clip.findUnique({ where: { id } });
const filePath = path.join(PATHS.exports, clip.exportPath);

// Validate path stays within allowed directory (prevent traversal)
const resolved = path.resolve(filePath);
if (!resolved.startsWith(path.resolve(PATHS.exports))) {
  return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid file path');
}

const stat = await fs.stat(resolved);
const buffer = await fs.readFile(resolved);

return new NextResponse(buffer, {
  headers: {
    'Content-Type': 'video/mp4',
    'Content-Length': String(stat.size),
    'Accept-Ranges': 'bytes',
  },
});
```

---

## 6. SSE Streaming Pattern

For real-time log streaming (`/api/jobs/[id]/logs/stream`):

```typescript
const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    // Poll and push events
    const interval = setInterval(async () => {
      const logs = await fetchNewLogs(jobId, cursor);
      for (const log of logs) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(log)}\n\n`));
      }
      // Close on terminal status
      if (['COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED_AD'].includes(job.status)) {
        clearInterval(interval);
        controller.close();
      }
    }, 1000);
  },
});

return new NextResponse(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  },
});
```

---

## 7. Checklist Before Adding a New Route

- [ ] File placed at correct path: `src/app/api/<resource>/route.ts`
- [ ] Handler wrapped in `catchApiErrors`
- [ ] Input validated, `VALIDATION_FAILED` returned for bad input
- [ ] Uses `apiSuccess()` / `apiError()` — never raw `NextResponse.json()`
- [ ] No pipeline logic — calls service or orchestrator only
- [ ] Path params awaited: `const { id } = await params`
- [ ] File paths resolved from DB, not from client input
- [ ] Update ARCHITECTURE.md API surface list
