# Skill: React Component Authoring

## Purpose

Standardize how React components are built in Clip Master's Next.js frontend, ensuring consistency with existing patterns, store integration, and manageable component sizes.

---

## 1. Project Conventions

### Directory Structure

```
src/components/          # Flat — no sub-folders, no barrel exports
  ├── JobList.tsx         # 438 lines
  ├── JobDetail.tsx       # 586 lines
  ├── ClipBrowser.tsx     # ~300 lines
  ├── ClipCard.tsx        # ~250 lines
  ├── ClipStudioModal.tsx # 2098 lines ← ANTI-PATTERN, do not replicate
  └── ...
```

- **Flat directory**: all components live directly in `src/components/`.
- **No barrel exports**: import each component by its file path.
- **No sub-folders**: don't create `components/shared/`, `components/ui/`, etc.
- **PascalCase** filenames matching component name.

### Size Ceiling

| Threshold     | Action                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| < 400 lines   | Healthy — proceed                                                      |
| 400–600 lines | Review — can logic be extracted to a hook or split into sub-component? |
| > 600 lines   | Split required — break into composable pieces                          |

`ClipStudioModal.tsx` at 2098 lines is acknowledged tech debt. Do not add to it. New features targeting the studio should be extracted into focused components.

---

## 2. Component Template

```tsx
'use client';

import React, { useState, useEffect } from 'react';
import useJobStore from '@/stores/useJobStore';
import { SomeIcon } from 'lucide-react';

interface MyComponentProps {
  jobId: string;
  onClose?: () => void;
}

const MyComponent: React.FC<MyComponentProps> = ({ jobId, onClose }) => {
  const [loading, setLoading] = useState(false);

  // Store selectors — pick only what you need
  const job = useJobStore((state) => state.jobs.find((j) => j.id === jobId));
  const addToast = useJobStore((state) => state.addToast);

  // Fetch on mount
  useEffect(() => {
    // fetch logic
  }, [jobId]);

  if (!job) return null;

  return <div className="...">{/* content */}</div>;
};

export default MyComponent;
```

---

## 3. Zustand Store Integration

### Stores

| Store           | File                          | Responsibility                                         |
| --------------- | ----------------------------- | ------------------------------------------------------ |
| `useJobStore`   | `src/stores/useJobStore.ts`   | Job list, clips, server counts, polling, fetch actions |
| `useToastStore` | `src/stores/useToastStore.ts` | Toast notification queue                               |

### Rules

1. **Select only what you need** — avoid subscribing to entire store:

```tsx
// ✅ Granular selector — re-renders only when this job changes
const job = useJobStore((state) => state.jobs.find((j) => j.id === jobId));

// ❌ Full store — re-renders on ANY state change
const store = useJobStore();
```

2. **All data comes from REST** — stores are caches of server truth, not source of truth. Optimistic updates reconcile on next poll.

3. **Polling lifecycle** — `useJobStore` polls fast while any job is RUNNING, slow when idle. Components do NOT manage their own polling intervals.

4. **Actions via store** — mutations (create job, cancel, etc.) are store actions that call REST internally:

```tsx
const createJob = useJobStore((state) => state.createJob);

const handleSubmit = async () => {
  await createJob({ sourceUrl });
  addToast('Job created', 'success');
};
```

---

## 4. Toast Pattern

```tsx
import useJobStore from '@/stores/useJobStore';

// Inside component
const addToast = useJobStore((state) => state.addToast);

// Usage — 4 types
addToast('Job created successfully', 'success');
addToast('Failed to create job', 'error');
addToast('Processing started', 'info');
addToast('Another job is already running', 'warning');
```

Toast types: `'success' | 'error' | 'info' | 'warning'`

---

## 5. Data Fetching Pattern

### REST calls from components

Components fetch via store actions or direct `fetch()` to `/api/*` routes:

```tsx
// Via store action (preferred for shared state)
const fetchJobs = useJobStore((state) => state.fetchJobs);
useEffect(() => {
  fetchJobs();
}, []);

// Direct fetch (for component-local data)
const [data, setData] = useState(null);
useEffect(() => {
  fetch(`/api/clips/${clipId}/subtitles`)
    .then((r) => r.json())
    .then((res) => {
      if (res.success) setData(res.data);
    });
}, [clipId]);
```

### Never import server-side modules

```tsx
// ❌ NEVER — breaks client bundle
import { db } from '@/server/db';
import { PATHS } from '@/server/paths';

// ✅ Always go through REST
fetch('/api/jobs');
```

---

## 6. Styling

- **Tailwind CSS** — inline classes, no CSS modules, no styled-components.
- **Dark theme** — existing UI uses dark backgrounds (`bg-gray-900`, `bg-gray-800`).
- **Responsive** — not a primary concern (localhost tool), but avoid fixed widths that break at common sizes.

```tsx
<div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
  <h2 className="text-lg font-semibold text-white">{title}</h2>
  <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
</div>
```

---

## 7. Icons

Use `lucide-react` only. Already installed, no other icon library allowed.

```tsx
import { Play, Pause, Trash2, Download, Settings } from 'lucide-react';

<Play className="w-4 h-4 text-green-400" />;
```

---

## 8. Modal Pattern

Modals are rendered inline in parent component, toggled via state:

```tsx
const [showModal, setShowModal] = useState(false);

return (
  <>
    <button onClick={() => setShowModal(true)}>Open</button>
    {showModal && <MyModal data={selectedItem} onClose={() => setShowModal(false)} />}
  </>
);
```

- Modal manages its own internal state.
- Parent owns visibility toggle.
- Close via `onClose` callback prop.

---

## 9. Checklist Before Adding a Component

- [ ] File in `src/components/`, PascalCase, no sub-folder
- [ ] `'use client'` directive at top
- [ ] Props typed with explicit interface
- [ ] Store selectors are granular (not full store subscription)
- [ ] No `@/server/*` imports
- [ ] Tailwind only for styling, dark theme colors
- [ ] Icons from `lucide-react` only
- [ ] Under 400 lines (or justified split plan)
- [ ] Toast for user feedback on actions
- [ ] Update ARCHITECTURE.md component list
