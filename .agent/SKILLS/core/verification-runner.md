# Verification Runner & TDD Quality Gate

## Purpose

Prevent **false completion** by requiring mechanical, deterministic, and evidence-based verification before a task may be marked as complete.

The agent MUST NOT declare a task complete based on reasoning, code inspection, or assumptions alone.

Completion requires:

1. Acceptance Criteria are explicitly mapped to verification methods.
2. Appropriate automated tests are created or updated.
3. Behavioral changes follow the TDD cycle where applicable.
4. Verification commands are actually executed.
5. Verification results provide concrete execution evidence.
6. Required regression checks pass.
7. Every Acceptance Criterion is verified.
8. Only then may the task be marked `[x]`.

> **Core principle: No evidence → No completion.**

---

# 1. Completion Contract

A task is considered complete ONLY when all of the following conditions are satisfied:

```text
Acceptance Criteria
        ↓
AC Verification Mapping
        ↓
Test / Verification Design
        ↓
Red → Green → Refactor
        ↓
Verification Suite
        ↓
Evidence Collection
        ↓
AC Coverage Check
        ↓
Regression Check
        ↓
Completion Decision = PASS
        ↓
TASK.md = [x]
```

The agent MUST NOT skip the verification stages merely because the implementation appears correct.

---

# 2. Acceptance Criteria Traceability

Every Acceptance Criterion MUST have an explicit verification mapping.

Example:

```md
## Acceptance Criteria

- AC-01: User can submit valid credentials.
- AC-02: Invalid credentials display an error message.
- AC-03: Successful authentication redirects to dashboard.
```

The agent MUST create a mapping such as:

```text
AC-01 → E2E: login.success.spec.ts
AC-02 → Component: login.validation.spec.ts
AC-03 → E2E: login.redirect.spec.ts
```

### Mandatory Rules

- Every AC MUST have at least one verification method.
- An unmapped AC is an automatic verification failure.
- A test that does not clearly correspond to an AC MUST NOT be counted as AC coverage.
- One test MAY verify multiple ACs only when the relationship is explicit.
- The agent MUST NOT claim full completion when any AC remains unverified.

---

# 3. Verification Method Selection

Do not force every Acceptance Criterion into a unit test.

Select the verification method according to the behavior being verified.

| Behavior                                   | Preferred Verification            |
| ------------------------------------------ | --------------------------------- |
| Pure function / business logic             | Unit test                         |
| Component behavior                         | Component test                    |
| API interaction                            | Integration test                  |
| User journey / critical flow               | E2E test                          |
| UI appearance                              | Visual / screenshot verification  |
| Accessibility                              | Accessibility test                |
| Type/API contract                          | Typecheck / schema validation     |
| Build behavior                             | Production build                  |
| Performance requirement                    | Performance test                  |
| Environment-specific behavior              | Explicit environment verification |
| Behavior that cannot be automated reliably | Manual verification               |

The chosen verification method MUST be appropriate for the actual Acceptance Criterion.

---

# 4. TDD Iron Law

For behavior-changing implementation work, follow the TDD cycle:

```text
RED → GREEN → REFACTOR
```

## 4.1 RED — Proof of Breakage

Before modifying production code:

1. Identify the relevant Acceptance Criteria.
2. Write the smallest meaningful automated test that represents the expected behavior.
3. Execute the test.
4. The test MUST fail for the expected behavioral reason.

### Valid RED

```text
Expected assertion failure
Expected missing behavior
Expected incorrect output
Expected missing UI state
```

### Invalid RED

The test MUST NOT fail because of:

```text
Syntax error
Typo
Broken import
Missing dependency
Incorrect test configuration
Invalid test setup
Environment failure
```

If the failure is caused by test infrastructure rather than missing behavior, fix the test first and repeat RED verification.

---

# 5. GREEN — Minimal Implementation

After obtaining a valid RED state:

1. Implement only the behavior required by the failing test.
2. Do not introduce speculative architecture.
3. Do not add unnecessary dependencies.
4. Do not modify unrelated functionality.
5. Run the relevant test again.

The implementation is considered GREEN only when the intended test passes.

```text
RED
  ↓
Minimal implementation
  ↓
Target test PASS
```

---

# 6. REFACTOR — Preserve Behavior

After GREEN:

1. Improve implementation quality.
2. Remove duplication.
3. Improve naming and structure.
4. Apply project conventions.
5. Clean up tests.
6. Apply applicable anti-slop/design rules.

Refactoring MUST NOT change the verified behavior.

After refactoring:

```text
Target tests MUST PASS
```

---

# 7. TDD Exceptions

The TDD Red requirement is the default for **behavior-changing implementation work**.

It MAY be skipped when the task is inherently unsuitable for traditional TDD, including:

- Documentation-only changes
- Configuration-only changes
- Dependency-only updates
- Formatting-only changes
- Pure CSS/style adjustments where the project's testing infrastructure does not support meaningful automated behavioral tests
- Generated files
- Build/tooling configuration
- Repository maintenance

When TDD is skipped, the agent MUST state why and provide an appropriate alternative verification method.

Example:

```text
TDD Exception:
Task changes ESLint configuration only.

Reason:
No production behavior is being introduced.

Alternative verification:
- ESLint execution
- Typecheck
- Build
```

An exception MUST NOT be used merely to avoid writing a test for behavior that can reasonably be tested.

---

# 8. Negative and Boundary Verification

Verification MUST NOT focus exclusively on the happy path.

For behavior involving input, state, validation, or failure handling, consider:

```text
Happy Path
Failure Path
Boundary Cases
Empty State
Loading State
Error State
Permission / Authorization State
```

Example:

```text
Requirement:
Password must contain at least 8 characters.

Verification:

< 8 characters → rejected
= 8 characters → accepted
> 8 characters → accepted
empty → rejected
```

The agent MUST inspect the Acceptance Criteria for explicitly defined failure and boundary behavior.

If such behavior is part of the AC, it MUST be directly verified.

---

# 9. Test Integrity Gate

A passing test is not automatically proof of correct behavior.

Tests MUST meaningfully assert the behavior they claim to verify.

The agent MUST avoid tests such as:

```js
expect(true).toBe(true);
```

or assertions that only verify implementation details without proving user-visible behavior.

Tests SHOULD assert:

- Output
- State
- Side effects
- User-visible behavior
- Error behavior
- API contract
- Navigation
- Persisted state
- Relevant business rules

### Mutation-Oriented Integrity Check

When practical, verify that the test would fail if the relevant behavior were intentionally broken.

Conceptually:

```text
Correct implementation
        ↓
Test PASS

Break relevant behavior
        ↓
Test MUST FAIL

Restore implementation
        ↓
Test MUST PASS
```

If the test continues passing after the relevant behavior is intentionally removed or bypassed, the test is insufficient and MUST be strengthened.

Actual mutation-testing tooling SHOULD be used when available and appropriate.

---

# 10. Verification Suite

Before marking a task complete, execute the verification suite defined by the project/task.

Typical example:

```bash
<target_test_command> &&
<full_test_command> &&
<typecheck_command> &&
<lint_command> &&
<build_command>
```

Not every project requires every command.

The task MUST define which gates are required.

Example:

```yaml
verification:
  required:
    - target-tests
    - full-tests
    - typecheck
    - lint
    - build

  optional:
    - e2e
    - visual
    - accessibility
```

The agent MUST NOT silently omit a required verification command.

---

# 11. Regression Gate

Passing the newly created or modified test is insufficient.

The agent MUST verify that existing functionality has not regressed.

At minimum:

```text
Target Tests
+
Relevant Existing Tests
```

For tasks where the project's verification infrastructure supports it, run:

```text
Target Tests
→ Full Test Suite
→ Typecheck
→ Lint
→ Build
→ E2E
```

The exact sequence MUST follow the project's documented verification commands.

---

# 12. Execution Evidence

The agent MUST execute verification commands rather than infer their results.

For every required verification gate, record:

```text
Command
Result
Exit Code
Relevant Summary
```

Example:

```text
Verification Evidence

Target Tests
Command: npm test -- login.spec.ts
Result: PASS
Exit Code: 0
Summary: 8 passed

Full Test Suite
Command: npm test
Result: PASS
Exit Code: 0
Summary: 243 passed

Typecheck
Command: npm run typecheck
Result: PASS
Exit Code: 0

Lint
Command: npm run lint
Result: PASS
Exit Code: 0

Build
Command: npm run build
Result: PASS
Exit Code: 0
```

### Evidence Rules

The agent MUST NOT claim:

```text
"Tests pass"
"Build works"
"Everything is good"
"Task completed"
```

unless the corresponding command was actually executed successfully.

If a command was not executed, report:

```text
NOT RUN
```

not:

```text
PASS
```

---

# 13. Verification Failure Handling

If any required verification fails:

```text
Completion Decision = FAIL
```

The agent MUST:

1. Inspect the failure.
2. Determine whether the failure is caused by:
   - implementation
   - test
   - configuration
   - environment
   - unrelated pre-existing failure

3. Fix the issue when it belongs to the current task.
4. Re-run the affected verification.
5. Re-run dependent verification gates when necessary.

The agent MUST NOT mark the task complete merely because the failure appears unrelated.

If a failure is genuinely pre-existing and unrelated, document it explicitly:

```text
Verification:
FAIL

Reason:
Pre-existing failure in unrelated test suite.

Current task verification:
PASS

Unrelated existing failure:
<command/output summary>
```

The task may only be marked complete if project/task policy explicitly allows pre-existing failures and the required AC verification itself passes.

---

# 14. Completion Decision

Before changing `TASK.md`, produce an internal verification summary equivalent to:

```text
Acceptance Criteria:
AC-01 PASS
AC-02 PASS
AC-03 PASS

Verification:
Target Tests PASS
Full Tests PASS
Typecheck PASS
Lint PASS
Build PASS

Regression:
PASS

Evidence:
AVAILABLE

Completion Decision:
PASS
```

The task MAY be marked `[x]` only when:

```text
ALL REQUIRED AC = PASS
ALL REQUIRED VERIFICATION GATES = PASS
EVIDENCE = AVAILABLE
NO UNRESOLVED TASK-RELATED FAILURE
```

Otherwise:

```text
Completion Decision:
FAIL
```

and the task MUST remain incomplete.

---

# 15. TASK.md Update Rule

The agent MUST NOT change:

```md
- [ ] Task
```

into:

```md
- [x] Task
```

until the Completion Decision is:

```text
PASS
```

The act of modifying `TASK.md` is itself a gated operation.

```text
Implementation complete
        ≠
Task complete
```

Only:

```text
Implementation
+
Verification
+
Evidence
+
AC Coverage
+
Regression
=
Task complete
```

---

# 16. Final Verification Report

Before declaring completion, provide a concise report:

```text
## Verification Report

### Acceptance Criteria

- AC-01: PASS
- AC-02: PASS
- AC-03: PASS

### Verification Gates

- Target Tests: PASS
- Full Tests: PASS
- Typecheck: PASS
- Lint: PASS
- Build: PASS
- E2E: PASS

### Regression

PASS

### Evidence

All required verification commands were executed successfully.

### Completion

PASS
```

If anything fails:

```text
## Verification Report

### Acceptance Criteria

- AC-01: PASS
- AC-02: FAIL
- AC-03: NOT VERIFIED

### Verification Gates

- Target Tests: FAIL
- Full Tests: NOT RUN
- Typecheck: PASS
- Lint: PASS
- Build: NOT RUN

### Completion

FAIL

Task MUST remain incomplete.
```

---

# 17. Hard Rules

The following rules are NON-NEGOTIABLE:

1. **No Acceptance Criterion may remain unverified.**
2. **No required verification command may be skipped silently.**
3. **No test result may be claimed without actual execution.**
4. **No production behavior change should bypass TDD without a documented reason.**
5. **A test failure caused by broken test infrastructure does not count as valid RED.**
6. **A passing test that does not meaningfully verify the requirement does not count as verification.**
7. **Target tests passing does not automatically mean the task is complete.**
8. **Regression verification is required.**
9. **No evidence means no completion.**
10. **The agent MUST NOT mark `TASK.md` as complete unless the Completion Decision is PASS.**

---

# 18. Core Principle

The agent's job is not to prove that the code **looks correct**.

The agent's job is to produce reproducible evidence that the implementation satisfies the specified behavior.

```text
DO NOT ASK:
"Does this code look correct?"

ASK:
"What evidence proves that every Acceptance Criterion works?"
```

> **Code inspection is not verification.**
>
> **A passing test is not automatically sufficient verification.**
>
> **A successful implementation without execution evidence is not complete.**
>
> **No evidence → No completion.**
