# Implementation Plan: KAN-18 — Filter/sort books by availability and author

## Source
- Requirements: `../design-batch1/requirements.md` (approved, merged via PR #3 to `main`)
- Epic: KAN-2

## Codebase Findings Informing This Plan
- `GET /api/books` (`../../src/routes/books.ts`) currently returns all rows
  unfiltered/unsorted (`SELECT * FROM books ORDER BY id ASC`) with no
  query-param handling and no pagination anywhere in the API.
- Availability today is a **stored** column `books.is_available`,
  toggled directly by `../../src/routes/loans.ts` on issue/return. The
  requirement (FR1, Q1) instead specifies availability must be
  **derived** by joining `books` with `loans` on the presence of an
  open loan (`returned_date IS NULL`). These two mechanisms are
  currently in sync but redundant; the plan reconciles them by making
  the API response derive availability via the join rather than
  trusting the stored flag, while leaving the column and its updates
  in place to avoid regressions in `loans.ts` (out of scope to change
  loan issue/return logic).
- No pagination exists in the client (`../../src/client/app.ts` calls
  `/api/books` and renders the full list) or the API. FR6/FR7 assume
  pagination exists ("applied before pagination", "resets to page 1").
  Since no pagination currently exists in the app, this plan treats
  adding minimal pagination as an in-scope prerequisite so FR6/FR7 are
  testable; if pagination is intentionally out of scope, FR6/FR7 are
  automatically satisfied (nothing to reset) but the ordering logic
  (filter/sort before slicing) must still be built so it is
  pagination-ready.
- No existing sort/filter UI controls in `../../public` or `src/client/`.

## Phase Overview
1. **Phase 1 — Backend query layer**: extend `GET /api/books` to accept
   `availability` and `sort` query params, derive availability via
   `loans` join, apply combined filter+sort, keep response shape
   backward compatible.
2. **Phase 2 — Pagination readiness**: add minimal `page`/`pageSize`
   handling in the same endpoint so filter/sort is applied before
   slicing, per FR6.
3. **Phase 3 — Frontend controls**: add Availability filter and
   Title/Author sort UI controls to the books list view, wire to the
   API, add Reset Filters action, reset to page 1 on any change.
4. **Phase 4 — Edge cases & validation**: handle invalid/unknown query
   values, empty result sets, empty database, case-insensitive author
   sort verification.
5. **Phase 5 — Documentation**: update API/user-facing docs to reflect
   new query params and UI behavior.

## Task List (ordered by dependency)

| ID | Description | Complexity | Depends On |
|----|--------------|------------|------------|
| T1 | Add `availability` query-param support to `GET /api/books`: derive availability per book via `LEFT JOIN` against `loans` filtered on `returned_date IS NULL` (open/active loan == not available); accept `availability=available` \| `not_available`; omit/invalid → no filter applied. | MEDIUM | — |
| T2 | Add `sort` query-param support to `GET /api/books`: `sort=title` (default, A-Z), `sort=author` (case-insensitive, e.g. `ORDER BY author COLLATE NOCASE ASC`, full stored name, no parsing). Default to Title A-Z when `sort` is absent or invalid. | MEDIUM | — |
| T3 | Combine T1 + T2 in a single query builder so `availability` and `sort` params apply together in one query (FR4) — refactor `books.ts` GET handler into one parameterized query rather than two independent code paths. | MEDIUM | T1, T2 |
| T4 | Add `page` / `pageSize` query-param handling to `GET /api/books`, applying LIMIT/OFFSET **after** the filter+sort from T3 (FR6). Return pagination metadata (e.g., `total`, `page`, `pageSize`) alongside `books` in the response. **Note:** response shape change (array → object with `books`/`total`) requires updating the client (T7) and is a breaking change for existing `/api/books` consumers (`app.ts` load-books and issue-book-select) — must update both call sites together. | HIGH | T3 |
| T5 | Add input validation: reject/ignore unrecognized `availability` and `sort` values gracefully (fall back to defaults, do not 500); validate `page`/`pageSize` are positive integers with sane caps. | LOW | T4 |
| T6 | Add Availability filter control (dropdown/segmented control: All / Available / Not available) and Sort control (Title A-Z / Author A-Z) to the books list UI in `../../public` + `src/client/app.ts`. | MEDIUM | T3 |
| T7 | Wire filter/sort UI controls to call `GET /api/books` with the corresponding query params; update `loadBooks()` in `app.ts` to read the new paginated response shape from T4. | MEDIUM | T4, T6 |
| T8 | Add "Reset Filters" button/action that clears filter+sort state and re-fetches the default view (unfiltered, Title A-Z, page 1) (FR5, AC7). | LOW | T7 |
| T9 | Ensure any change to filter or sort control resets current page state to 1 before re-fetching (FR7, AC6). | LOW | T7 |
| T10 | Edge cases: empty books table, filter yields zero matches, author values with mixed case, single-page result sets (pagination controls hidden or no-op). Manual verification pass against acceptance criteria AC1–AC7. | MEDIUM | T5, T8, T9 |
| T11 | Update developer/API documentation (e.g., README or `..`) describing new `/api/books` query params (`availability`, `sort`, `page`, `pageSize`) and response shape. | LOW | T4 |

## Blocked Tasks
- None currently blocked. T4 carries a noted risk (response shape
  change affecting the issue-book dropdown in `app.ts`), tracked as a
  dependency on T7 rather than a hard block, since it must land in the
  same change set as the client update.

## Complexity Summary
- LOW: T5, T8, T9, T11 (4 tasks)
- MEDIUM: T1, T2, T3, T6, T7, T10 (6 tasks)
- HIGH: T4 (1 task)

Overall story complexity: **MEDIUM** — no schema changes, no new
tables/indexes required; primary risk is the response-shape change
introduced by pagination (T4) needing coordinated frontend updates.

## Out of Scope (carried from requirements.md)
- Saved filter presets.
- Sorting by additional fields (genre, publisher).
- Exporting filtered results.

## Dependencies on Other Stories
- None (per requirements Q2 — this story is independent of other
  KAN-2 stories).
