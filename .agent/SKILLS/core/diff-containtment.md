# Core Skill: Blast-Radius & Diff Containment Audit

## Purpose

Prevent:

- Scope creep
- Unauthorized file mutations
- Silent regressions
- Accidental dependency drift
- Configuration hijacking
- Secret leakage
- Unintended deletions
- Formatting sprawl
- Generated-file pollution
- Destructive or unexplained refactors

by requiring a deterministic **change-control audit** before a task may be declared complete or committed.

> **Core principle: Every mutation must be intentional, explainable, and contained.**

A passing implementation test does NOT imply that the change is safe.

```text
Implementation Correctness
        ≠
Change Safety
```

Both must pass independently.

---

# 1. Boundary Law

The agent MUST NOT modify files outside the task's approved change boundary.

The task boundary is defined by:

```text
TASK.md
+
Affected Files
+
Explicitly Required Supporting Changes
```

An affected file is any file that the agent intentionally creates, modifies, renames, or deletes as part of the task.

### Default Rule

If a file is not approved by the task and is not an explicitly justified supporting change:

```text
DO NOT MODIFY
```

This includes:

- Source files
- Tests
- Configuration
- Documentation
- Package manifests
- Lockfiles
- CI/CD configuration
- Environment files
- Generated files
- Scripts
- Assets
- Build output
- IDE/editor configuration

---

# 2. Affected Files Contract

Before implementation begins, establish the expected change boundary.

Example:

```md
## Affected Files

- src/features/auth/LoginForm.tsx
- src/features/auth/LoginForm.test.tsx
- src/features/auth/auth.service.ts
```

The agent MUST treat this as the initial allowlist.

However, some tasks legitimately require supporting changes.

Example:

```text
Task:
Add dependency required by the feature.

Required supporting mutation:
package.json
package-lock.json
```

In this situation the supporting files MUST be explicitly justified.

Example:

```text
Approved Supporting Files

- package.json
  Reason: required dependency

- package-lock.json
  Reason: generated lockfile update caused by package.json
```

Unexplained mutations remain violations.

---

# 3. Change Classification

Every changed path MUST be classified as one of:

```text
MODIFIED
ADDED
DELETED
RENAMED
COPIED
GENERATED
```

The audit MUST detect all categories.

Do not inspect only modified files.

A task can be compromised by:

```text
untracked secret file
deleted source file
renamed configuration
generated artifact
unexpected binary
```

even when the normal diff appears clean.

---

# 4. Initial Repository Baseline

Before making changes, establish a repository baseline.

The agent SHOULD inspect:

```text
Git status
Current branch
Existing working-tree changes
Relevant repository configuration
```

The purpose is to distinguish:

```text
PRE-EXISTING CHANGES
```

from:

```text
CHANGES INTRODUCED BY THIS TASK
```

### Critical Rule

The agent MUST NOT assume that every existing working-tree change belongs to the current task.

Pre-existing changes MUST be preserved.

The agent MUST NOT:

- Revert them
- Format them
- Stage them
- Include them in the task commit
- "Clean up" unrelated work

unless explicitly instructed.

---

# 5. Pre-Existing Dirty Worktree

If the repository is already dirty before implementation:

```text
Working Tree
├── Existing changes
└── Current task changes
```

the agent MUST establish a baseline.

Conceptually:

```text
BASELINE = git status + git diff before task
```

Later:

```text
CURRENT = git status + git diff after task
```

The audit should compare:

```text
CURRENT - BASELINE
```

rather than assuming the entire working tree belongs to the agent.

If reliable separation cannot be established, the agent MUST report the ambiguity instead of blindly reverting files.

---

# 6. Dependency Drift Gate

Dependency changes are high-impact mutations.

The agent MUST treat the following as sensitive:

```text
package.json
package-lock.json
pnpm-lock.yaml
yarn.lock
bun.lock
go.mod
go.sum
Cargo.toml
Cargo.lock
requirements.txt
pyproject.toml
poetry.lock
Gemfile
Gemfile.lock
```

and equivalent dependency manifests.

### Rules

The agent MUST NOT:

- Upgrade unrelated dependencies
- Downgrade unrelated dependencies
- Replace package versions for convenience
- Regenerate lockfiles unnecessarily
- Add dependencies merely to avoid implementation work

If dependency modification is required:

```text
Dependency Change
        ↓
Explicit Justification
        ↓
Minimal Dependency Delta
        ↓
Verification
```

Unrelated dependency changes are a containment failure.

---

# 7. Configuration Integrity Gate

Configuration files are high-leverage files.

Examples:

```text
tsconfig.json
vite.config.ts
webpack.config.*
next.config.*
eslint.config.*
.prettierrc*
babel.config.*
jest.config.*
vitest.config.*
playwright.config.*
docker-compose.*
Dockerfile
CI/CD configuration
```

The agent MUST NOT modify configuration to make verification pass unless the configuration change itself is part of the task.

Forbidden pattern:

```text
Test fails
   ↓
Modify test configuration to hide failure
   ↓
Test passes
```

Examples of suspicious behavior:

- Disabling lint rules
- Disabling type checking
- Excluding files from tests
- Lowering coverage thresholds
- Changing compiler strictness
- Disabling failing E2E tests
- Ignoring directories containing errors
- Suppressing warnings solely to obtain a green build

If a configuration change is genuinely required, the audit MUST document:

```text
File:
Reason:
Behavior affected:
Why this change is necessary:
Verification:
```

---

# 8. Secret & Credential Gate

The agent MUST inspect the final diff for accidental secret exposure.

High-risk patterns include:

```text
API keys
Access tokens
JWTs
Private keys
Passwords
Client secrets
Database credentials
Cloud credentials
OAuth secrets
Webhook secrets
Service account credentials
```

Sensitive files include:

```text
.env
.env.*
*.pem
*.key
credentials.*
secrets.*
service-account.*
```

The agent MUST NOT add secrets to source control.

Before completion, inspect:

```text
Added lines
New files
Renamed files
Configuration changes
Environment files
Scripts
Test fixtures
```

Test credentials should use safe fixtures or mocks.

If a secret-like value is detected:

```text
Completion = BLOCKED
```

until it is removed or explicitly confirmed safe.

---

# 9. Diff Containment Audit

After implementation and verification, inspect the complete task diff.

The audit MUST include:

```text
git status
git diff
git diff --stat
```

and, where applicable:

```text
git diff --cached
```

The objective is to answer:

```text
"What exactly changed?"
```

not merely:

```text
"Did the tests pass?"
```

---

# 10. File-Level Containment Gate

For every changed path:

```text
Is this file in Affected Files?
        │
        ├── YES → Continue
        │
        └── NO
             │
             ▼
       Is it an explicitly
       justified supporting file?
             │
             ├── YES → Document reason
             │
             └── NO → BLOCK
```

Unexpected files MUST NOT simply be ignored.

They must either be:

1. Removed/reverted safely, or
2. Explicitly added to the task's approved scope with justification.

---

# 11. Semantic Diff Audit

Inspect the actual content changes, not only filenames.

The agent MUST inspect for:

### API / Function Contract Changes

Check for:

- Changed function signatures
- Changed exported symbols
- Changed component props
- Changed return types
- Changed API payloads
- Changed event contracts
- Changed public interfaces

Unexpected contract changes require investigation.

---

### Deleted Behavior

Look for:

- Removed validation
- Removed error handling
- Removed fallback behavior
- Removed loading states
- Removed authorization checks
- Removed analytics/events
- Removed accessibility behavior
- Removed tests
- Removed error boundaries

A deletion is not automatically bad, but it MUST be intentional.

---

### Logic Replacement

Check whether code was:

```text
removed
```

without an equivalent replacement.

Suspicious pattern:

```text
Old validation removed
+
No replacement
```

This may indicate silent regression.

---

### Hardcoded Values

Inspect added code for suspicious hardcoded:

```text
URLs
Credentials
Tokens
IDs
Environment-specific values
Timeouts
Feature flags
Business constants
```

Hardcoding is not automatically invalid, but unexplained environment-specific or security-sensitive values require review.

---

# 12. Formatting Sprawl Gate

The agent MUST detect unrelated formatting changes.

Examples:

```text
Entire file reformatted
Quote style changed everywhere
Indentation changed across unrelated blocks
Import ordering changed across unrelated modules
Line endings changed
Generated formatting noise
```

Formatting changes outside the task's relevant code MUST be removed unless required by repository tooling.

Prefer:

```text
Minimal Diff
```

over:

```text
Cosmetic Rewrite
```

A larger diff is not automatically a failure, but unexplained diff expansion is a containment warning.

---

# 13. Diff Size & Complexity Audit

The agent SHOULD compare the implementation scope against the requested behavior.

Ask:

```text
Does the amount of change make sense for the task?
```

Examples:

```text
Task:
Add one validation rule.

Expected:
Small localized change.

Observed:
20 files changed + dependency upgrade + config rewrite.
```

This is a blast-radius warning.

The agent MUST investigate unexpectedly large diffs.

Do not enforce an arbitrary line-count limit. Instead evaluate:

```text
Changed Files
Changed Lines
Changed Modules
Dependency Changes
Configuration Changes
Public API Changes
Architectural Changes
```

against the task's actual requirements.

---

# 14. Generated Files

Generated files require special handling.

Examples:

```text
dist/
build/
coverage/
generated/
*.generated.*
API clients
codegen output
```

The agent MUST determine whether generated files are:

```text
Expected repository artifacts
```

or:

```text
Accidental working-tree pollution
```

Do not commit generated output merely because a build command produced it.

Follow repository conventions.

---

# 15. Binary & Large File Gate

Unexpected binary or large-file additions require investigation.

Examples:

```text
Images
Videos
Archives
Executables
Database files
Large JSON fixtures
Build artifacts
```

The agent SHOULD inspect whether the file is:

```text
Required
Expected
Generated
Accidental
Sensitive
```

Unexpected large or binary files SHOULD block completion until explained.

---

# 16. Delete / Rename Safety Gate

File deletion and renaming require explicit review.

Before accepting a deletion, verify:

```text
Is the file obsolete?
Are there remaining imports/references?
Is functionality preserved?
Is the deletion explicitly required?
```

Before accepting a rename:

```text
Are imports updated?
Are references updated?
Are configuration references updated?
Are documentation references updated?
```

Do not treat rename detection as equivalent to a harmless formatting change.

---

# 17. Reference Integrity

For changed or deleted symbols/files, inspect references.

Examples:

```text
Deleted function
Deleted component
Renamed module
Changed exported symbol
Changed route
Changed API endpoint
```

Verify that relevant consumers remain valid.

This MAY be performed through:

```text
Typecheck
Tests
Search
Static analysis
Build
```

The exact mechanism depends on the repository.

---

# 18. Git Audit Protocol

After implementation and verification, execute the following audit sequence through the available Git tooling/MCP.

```text
[ Implementation ]
        │
        ▼
[ Verification Suite PASS ]
        │
        ▼
[ git_status ]
        │
        ▼
[ Compare against baseline ]
        │
        ▼
[ File Containment Audit ]
        │
        ├── Unexpected files?
        │       │
        │       ├── YES → Investigate / Remove / Approve
        │       └── NO
        │
        ▼
[ git_diff --stat ]
        │
        ▼
[ git_diff ]
        │
        ▼
[ Semantic Diff Audit ]
        │
        ├── Contract change?
        ├── Deleted behavior?
        ├── Config mutation?
        ├── Dependency drift?
        ├── Secret?
        ├── Formatting sprawl?
        ├── Unexpected generated files?
        └── Suspicious blast radius?
        │
        ▼
[ Security / Secret Audit ]
        │
        ▼
[ Final Containment Decision ]
        │
        ├── FAIL → Clean / Investigate
        │
        └── PASS → Ready for completion / commit
```

The exact Git command/tool names MAY vary depending on the environment.

The semantic requirements of this protocol MUST remain unchanged.

---

# 19. Rollback Rules

When an unauthorized mutation is detected:

```text
UNAUTHORIZED FILE
        ↓
Determine ownership
        ↓
Is it pre-existing?
        │
        ├── YES → Preserve
        │
        └── NO → Remove/revert
```

The agent MUST NOT blindly execute:

```bash
git reset --hard
```

or equivalent destructive commands when the working tree contains pre-existing user changes.

Preserve unrelated work.

Rollback MUST be as targeted as possible.

---

# 20. Commit Gate

Before creating a commit, the agent MUST verify:

```text
[ ] Acceptance Criteria verified
[ ] Verification suite passed
[ ] Expected files only
[ ] Supporting files justified
[ ] No unrelated modifications
[ ] No accidental deletions
[ ] No accidental renames
[ ] No dependency drift
[ ] No configuration hijacking
[ ] No generated-file pollution
[ ] No secrets
[ ] No suspicious hardcoded credentials
[ ] Semantic diff reviewed
[ ] Blast radius is understood
```

Only after all applicable checks pass may the agent proceed with commit preparation.

---

# 21. Final Containment Report

Before completion, produce a concise report:

```text
## Change Containment Report

### Scope

Expected Files:
- src/features/auth/LoginForm.tsx
- src/features/auth/LoginForm.test.tsx

Supporting Files:
- None

### Actual Changes

Modified:
- src/features/auth/LoginForm.tsx
- src/features/auth/LoginForm.test.tsx

Added:
- None

Deleted:
- None

Renamed:
- None

### Dependency Changes

None.

### Configuration Changes

None.

### Secret Audit

PASS — no secrets detected in added/modified content.

### Semantic Diff

PASS

- No unexpected public API changes.
- No unexplained behavior deletion.
- No unrelated formatting changes.
- No suspicious hardcoded credentials.

### Blast Radius

Contained to authentication form implementation and its tests.

### Final Decision

PASS
```

---

# 22. Failure Report

If containment fails:

```text
## Change Containment Report

### Scope

Expected Files:
- src/features/auth/LoginForm.tsx
- src/features/auth/LoginForm.test.tsx

Unexpected Files:
- package.json
- src/config/api.ts

### Findings

1. package.json
   Reason: dependency added without task authorization.

2. src/config/api.ts
   Reason: unrelated API configuration modified.

### Security

PASS

### Semantic Diff

BLOCKED

### Final Decision

FAIL

Task MUST NOT be marked complete.
Commit MUST NOT be created.
```

---

# 23. Hard Rules

The following rules are NON-NEGOTIABLE:

1. **Do not modify files outside the approved task boundary without explicit justification.**
2. **Do not overwrite or revert pre-existing user changes.**
3. **Do not silently accept unexpected files.**
4. **Do not modify dependencies merely to make implementation easier.**
5. **Do not modify configuration merely to suppress verification failures.**
6. **Do not commit secrets or credentials.**
7. **Do not ignore deleted or renamed files during the audit.**
8. **Do not treat a passing test as proof that the diff is safe.**
9. **Do not treat a small diff as automatically safe.**
10. **Do not treat a large diff as automatically invalid; investigate its necessity.**
11. **Do not perform broad formatting outside the task scope.**
12. **Do not use destructive Git commands against an unknown or dirty working tree.**
13. **Every unexpected mutation must be explained, removed, or explicitly approved.**
14. **The complete final diff MUST be reviewed before completion.**
15. **The task MUST NOT be marked complete when the containment audit fails.**
16. **The agent MUST NOT create a commit while unresolved containment violations remain.**

---

# 24. Relationship With Verification Gate

This skill is intentionally separate from the Verification Runner.

The two gates answer different questions:

```text
Verification Runner

"Does the implementation satisfy the Acceptance Criteria?"
```

versus:

```text
Blast-Radius Audit

"Did we change only what was necessary and authorized?"
```

A task is complete only when BOTH pass:

```text
                TASK COMPLETE
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
   Verification Gate      Containment Gate
          │                     │
          │                     │
      AC = PASS            Diff = SAFE
          │                     │
          └──────────┬──────────┘
                     ▼
                  [x] DONE
```

A task MUST NOT be considered complete when:

```text
Verification = PASS
Containment = FAIL
```

or:

```text
Verification = FAIL
Containment = PASS
```

Both are required.

---

# 25. Core Principle

The agent must be able to answer two questions before declaring completion:

```text
1. Did I build what was requested?

2. Did I change only what was necessary to build it?
```

The first is **behavioral correctness**.

The second is **change containment**.

> **Correct behavior with uncontrolled changes is not a clean completion.**
>
> **A clean diff without verified behavior is not a complete implementation.**
>
> **Every mutation must be intentional, explainable, and contained.**
