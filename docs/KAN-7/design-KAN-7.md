# Design — KAN-7: View overdue loans list

## Architecture Document
```
┌─────────────────────┐        GET /api/loans/overdue        ┌──────────────────────┐
│   Client (browser)  │ ────────────────────────────────────▶ │  Express Server       │
│  src/client/app.ts  │                                        │  src/server.ts        │
│  "Overdue Loans"     │ ◀──────────────────────────────────── │  src/routes/loans.ts   │
│  view (new)          │        JSON: overdue loan rows        │  (new route handler)  │
└─────────────────────┘                                        └──────────┬───────────┘
                                                                           │
                                                                           ▼
                                                                 ┌──────────────────┐
                                                                 │  SQLite (better- │
                                                                 │  sqlite3)         │
                                                                 │  books/members/   │
                                                                 │  loans tables     │
                                                                 │  (unchanged)      │
                                                                 └──────────────────┘
```
New/changed components:
- `src/routes/loans.ts` — add one new handler,
  `router.get('/overdue', ...)`, alongside the existing `GET /`,
  `POST /issue`, `POST /return` handlers. No new files needed; this
  router is already mounted at `/api/loans` in `src/server.ts`.
- `src/client/app.ts` (or equivalent client view module) — add a new
  "Overdue Loans" view: a fetch call plus a render function that
  either lists rows or shows an empty-state message.
- No changes to `src/db/database.ts` — `books`, `members`, `loans`
  schemas are reused as-is.

## HLD (High-Level Design)
- **Tables affected**: none changed. Reads only from existing
  `books`, `members`, `loans` tables.
- **Endpoints affected**: one new endpoint,
  `GET /api/loans/overdue`, added to the existing `loans` router.
  No changes to `GET /api/loans`, `POST /api/loans/issue`, or
  `POST /api/loans/return`.
- **UI screens affected**: one new screen/section, "Overdue Loans,"
  reachable via a new navigation entry alongside the existing Loans
  view. The existing Loans view is unchanged.

## LLD (Low-Level Design)
**Endpoint**: `GET /api/loans/overdue`

Query (mirrors the existing `GET /` handler's join, adding an
overdue filter and a computed field):
```sql
SELECT l.id, l.issued_date, l.due_date,
       b.id AS book_id, b.title, b.isbn,
       m.id AS member_id, m.name, m.email,
       CAST(julianday('now') - julianday(l.due_date) AS INTEGER) AS days_overdue
FROM loans l
JOIN books b ON l.book_id = b.id
JOIN members m ON l.member_id = m.id
WHERE l.returned_date IS NULL
  AND l.due_date < date('now')
ORDER BY l.due_date ASC
```

**Response shape** (200 OK, JSON array, empty array `[]` when none
overdue):
```json
[
  {
    "id": 12,
    "issued_date": "2026-08-01",
    "due_date": "2026-08-15",
    "book_id": 3,
    "title": "Clean Code",
    "isbn": "9780132350884",
    "member_id": 7,
    "name": "Jane Doe",
    "email": "jane@example.com",
    "days_overdue": 26
  }
]
```

**Validation logic**: No request body/params — this is a parameter-
less GET, so no input validation is required. The date filter uses
SQLite's own `date('now')`/`julianday('now')` functions, consistent
with the existing `issued_date`/`due_date` string format
(`YYYY-MM-DD`) already used by `POST /issue`.

**Client-side**:
- New fetch: `fetch('/api/loans/overdue')` → parse JSON array
- Render: for each row, display member name, member email, book
  title, book ISBN, issue date, due date, days overdue
- If array length is 0, render an empty-state message (e.g. "No
  overdue loans 🎉") instead of a table

## Wireframes
**Overdue Loans view — with data:**
```
+--------------------------------------------------------------+
| Overdue Loans                                                 |
+--------------------------------------------------------------+
| Member        | Email          | Book         | ISBN  | Issued | Due   | Days Overdue |
|----------------|----------------|---------------|-------|--------|-------|--------------|
| Jane Doe       | jane@ex.com    | Clean Code    | 97801 | 08-01  | 08-15 | 26           |
| John Smith     | john@ex.com    | Refactoring   | 97802 | 07-20  | 08-03 | 38           |
+--------------------------------------------------------------+
```

**Overdue Loans view — empty state:**
```
+--------------------------------------------------------------+
| Overdue Loans                                                 |
+--------------------------------------------------------------+
|                                                                |
|                  No overdue loans right now.                  |
|                                                                |
+--------------------------------------------------------------+
```

## Self-Review Findings
| Severity | Finding | Recommendation |
|---|---|---|
| LOW | `days_overdue` computed with `julianday('now')`, which includes time-of-day, not just the date; could be off by a fractional day near midnight | Use `julianday(date('now'))` (date-only, no time component) so `days_overdue` is a clean whole-day integer matching the due date's own date-only format |
| LOW | No caching/memoization — every view load re-runs the query | Acceptable at current data scale (consistent with existing `GET /api/loans` endpoint, which also has no caching) |
| LOW | No dedicated automated test for the new endpoint is specified in the impl plan | Add a route test asserting only overdue, unreturned loans are returned, mirroring existing test patterns in `tests/` |
| MEDIUM | If the client's clock/timezone differs from the SQLite server's `date('now')` (UTC), "overdue" boundary could disagree with what the librarian expects at day boundaries | Compute overdue status server-side only (as designed) and document that `due_date` comparisons use the server's UTC date, consistent with how `issued_date`/`due_date` are already generated in `POST /issue` |

## Overall Decision
**APPROVED** — no schema changes, one new read-only endpoint reusing
an existing join pattern, one new read-only UI view; all findings
are LOW/MEDIUM and non-blocking, with the `julianday('now')` LOW
finding recommended as a fix during implementation (T1).

---
**Human Checkpoint (autonomous run note):** This design was produced
without a live human APPROVE/REJECT reply. It must be explicitly
reviewed and APPROVEd or REJECTed by a human before this bundle
proceeds to Developer Agent (Stage 4).
