# Implementation Plan — KAN-7: View overdue loans list

## Phase Overview
- **Phase 1 — Backend**: Add an overdue-loans query and expose it
  via a new API endpoint.
- **Phase 2 — Frontend**: Add an Overdue Loans view that calls the
  endpoint and renders results, including the empty state.
- **Phase 3 — Verification**: Manually verify all 3 acceptance
  criteria against seeded/test data.

## Task List
| ID | Description | Complexity | Depends On |
|---|---|---|---|
| T1 | Add `GET /api/loans/overdue` route in `src/routes/loans.ts` that selects loans where `returned_date IS NULL AND due_date < date('now')`, joined to `books` and `members` (same join shape as the existing `GET /` handler), including a computed `days_overdue` field | MEDIUM | none |
| T2 | Add/confirm route registration for the new endpoint (verify `src/server.ts` already mounts `loans` router at `/api/loans`, so no new mount point is needed) | LOW | T1 |
| T3 | Add client-side fetch call to `GET /api/loans/overdue` in `src/client/app.ts` (or the relevant client module) | LOW | T1, T2 |
| T4 | Add "Overdue Loans" view/section in the UI that renders member name/email, book title/ISBN, issue date, due date, and days overdue per row | MEDIUM | T3 |
| T5 | Add empty-state message in the Overdue Loans view, shown when the API returns an empty array | LOW | T4 |
| T6 | Add navigation entry/link to reach the new Overdue Loans view from the existing app navigation | LOW | T4 |
| T7 | Manually verify all 3 acceptance criteria: overdue-only filtering, all required fields displayed per row, empty state when no overdue loans | LOW | T5, T6 |

## Blocked Tasks
None.

## Complexity Summary
2 LOW-adjacent backend/registration tasks, 1 MEDIUM backend query
task, 2 MEDIUM/LOW frontend tasks, 1 LOW navigation task, 1 LOW
verification task. Overall: **4 LOW, 2 MEDIUM, 0 HIGH** (T2, T3, T5,
T6, T7 = LOW; T1, T4 = MEDIUM). Overall story complexity: **LOW-MEDIUM**
— no schema changes, one new read-only endpoint, one new read-only
UI view reusing the existing Loans view's data shape.
