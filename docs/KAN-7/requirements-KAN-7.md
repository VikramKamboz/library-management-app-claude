# Requirements — KAN-7: View overdue loans list

## Story Overview
As a librarian, I want to see a list of overdue loans, so that I can
follow up with members and prioritize returns.

- Story Points: Not set
- Assignee: Unassigned
- Status: To Do

## Functional Requirements
- Add a server-side endpoint that returns only loans that are
  overdue: `returned_date IS NULL` (not yet returned) AND `due_date`
  is before the current date, joined against `books` and `members`
  (same join pattern already used by `GET /api/loans` in
  `src/routes/loans.ts`)
- Each overdue loan record returned/displayed must include: member
  name, member email, book title, book ISBN, issue date (`issued_date`),
  due date (`due_date`), and days overdue (computed as
  `today - due_date` in whole days)
- Add a new "Overdue Loans" view in the client UI
  (`src/client/app.ts` / corresponding HTML) that calls this
  endpoint and renders the results in a table
- When there are zero overdue loans, the view must render an empty
  state message instead of an empty table

## Non Functional Requirements
- Overdue loans query must reuse the existing SQLite `loans`,
  `books`, `members` tables — no new tables
- Response time should stay consistent with the existing
  `GET /api/loans` endpoint (no added N+1 queries; overdue filtering
  done in a single SQL query with a date comparison)
- No new authentication/authorization requirements — the view is
  available to the same users who can already access the existing
  Loans view (no auth system currently exists in the app)

## Acceptance Criteria
1. Given loans exist with due dates in the past and not returned,
   when I open the Overdue Loans view, then I see only overdue loans.
2. Given the overdue loans list is displayed, when I view a record,
   then I can see member name/email, book title/ISBN, issue date,
   due date, and days overdue.
3. Given the overdue loans list is displayed, when there are no
   overdue loans, then the UI displays an empty state message.

## Clarifications and Decisions
- Constraints: Must reuse the existing `loans`, `books`, `members`
  tables and the existing join pattern already used in
  `GET /api/loans` (`src/routes/loans.ts`) — no schema changes. Date
  comparisons must use the same `YYYY-MM-DD` string format already
  stored in `issued_date`/`due_date`/`returned_date`.
  *[Assumed — pending human confirmation; no dedicated technical
  constraints were supplied beyond the story text.]*
- Dependencies: None on other stories — this is a read-only
  extension of the existing Loans feature. Depends only on the
  existing `loans`/`books`/`members` schema already in place.
  *[Assumed — pending human confirmation.]*
- Definition of done: A new `GET /api/loans/overdue` endpoint exists
  and returns only unreturned loans whose due date is before today;
  a new "Overdue Loans" UI view consumes it and displays member
  name/email, book title/ISBN, issue date, due date, and days
  overdue per row; the view shows an explicit empty state when no
  rows are returned; all 3 acceptance criteria pass manual/UI
  verification. *[Assumed — pending human confirmation.]*
- NFRs: No new performance targets beyond "as fast as the existing
  loans list"; no new security requirements since the app has no
  auth layer today. *[Assumed — pending human confirmation.]*
- Out of scope: Sorting/filtering the overdue list, pagination,
  email/notification sending to members, and marking a loan as
  "overdue" in the database (overdue is a computed/derived state
  only, not a persisted flag). *[Assumed — pending human
  confirmation.]*

## Out of Scope
- Sorting or filtering controls on the Overdue Loans view
- Pagination of the overdue loans list
- Any notification/email to members about overdue books
- Persisting an "overdue" status/flag on the `loans` table —
  overdue is always computed at request time from `due_date` vs.
  today's date

---
**Human Checkpoint (autonomous run note):** This document was
produced without a live human reply to the 5 clarifying questions
(Q1–Q5). Every answer above is marked `[Assumed — pending human
confirmation]` and must be explicitly APPROVEd or REJECTed by a
human before this bundle proceeds to Developer Agent (Stage 4).
