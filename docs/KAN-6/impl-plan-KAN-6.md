# Implementation Plan — KAN-6: Renew an issued book with rules

## Phase Overview
1. **Phase 1 — Data & Rules Foundation:** Add the `renewal_count`
   column to the existing `loans` table (`src/db/database.ts`) and
   introduce the renewal policy constants/eligibility logic
   (max renewals = 2, overdue block) in `src/validators.ts`. Both
   later phases depend on this foundation.
2. **Phase 2 — API:** Implement the `POST /api/loans/renew`-style
   endpoint in `src/routes/loans.ts`, following the existing
   `issue`/`return` pattern, wiring in the eligibility logic and
   `calculateDueDate()` from Phase 1.
3. **Phase 3 — UI:** Add the librarian-facing UI control/action that
   calls the renewal endpoint and surfaces the block messages
   (max renewals reached / overdue) to the librarian.
4. **Phase 4 — Test Coverage (App-Repo DoD):** Add automated
   unit/integration tests in this app repo covering the renewal
   logic (success path, max-renewals block, overdue block), per the
   story's own Definition of Done. This is separate from the later
   `tester-agent` Playwright stage in the test repo.

## Task List
| ID | Description | Complexity | Depends On |
|---|---|---|---|
| T1 | Add `renewal_count` column to the `loans` table in `src/db/database.ts` (default 0), as the minimal schema change needed to track renewals per loan | MEDIUM | none |
| T2 | Add a `MAX_RENEWALS = 2` constant and a renewal-eligibility check in `src/validators.ts` that: (a) rejects if the loan's `renewal_count >= MAX_RENEWALS`, and (b) rejects if the loan is overdue (`due_date` in the past, `returned_date IS NULL`, same definition as `GET /api/loans/overdue`) | MEDIUM | T1 |
| T3 | Implement `POST /api/loans/renew` endpoint in `src/routes/loans.ts`: look up the active loan, run the T2 eligibility check, on success extend `due_date` via `calculateDueDate()` (reused from `src/validators.ts`) and increment `renewal_count`; on failure return a clear error message identifying which rule blocked the renewal (max renewals reached vs. overdue) | MEDIUM | T1, T2 |
| T4 | Add a librarian-facing UI control/action to trigger renewal for an active loan, calling the T3 endpoint and displaying success (new due date) or the blocking error message returned by the API | MEDIUM | T3 |
| T5 | Add automated unit/integration tests (app repo) covering: successful renewal (due date extended by 14 days, renewal_count incremented), renewal blocked at max renewals (2), and renewal blocked when overdue — per this story's own Definition of Done | MEDIUM | T2, T3 |

## Blocked Tasks
None — all tasks are sequenced behind their listed dependencies and
none are waiting on anything outside this plan (no external
approvals, no undecided requirements).

## Complexity Summary
0 LOW, 5 MEDIUM, 0 HIGH. Overall story complexity: MEDIUM — the
feature is contained to the `loans` table/route/UI, but it carries
a real (if minimal) schema change (T1), two independent business
rules to enforce correctly (max renewals, overdue block), both an
API and a UI surface, and a dedicated test-coverage task, which
together push it above a LOW/simple single-endpoint change.
