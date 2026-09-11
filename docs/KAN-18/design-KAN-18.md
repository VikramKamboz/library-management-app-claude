# Design Document: KAN-18 — Filter/sort books by availability and author

## Source
- Requirements: `../design-batch1/requirements.md` (approved, merged via PR #3 to `main`)
- Implementation Plan: `impl-plan.md` (approved, merged via PR #4 to `main`)
- Epic: KAN-2

## App Context (constraints honored)
- Tables: `books`, `members`, `loans` — no new tables or columns.
- Stack: Node.js, Express, TypeScript, SQLite, port 5050. No new
  dependencies are required for this story — all changes use the
  existing `better-sqlite3`/Express stack already present in
  `../../src/routes/books.ts`.

---

## 1. Architecture Document

### 1.1 Current State
```
public/index.html --(fetch)--> GET /api/books --(SELECT * FROM books ORDER BY id ASC)--> SQLite
src/client/app.ts:loadBooks()                  src/routes/books.ts
```
- No query params, no pagination, no derived availability — `is_available`
  is a stored column toggled by `../../src/routes/loans.ts` on issue/return.

### 1.2 Target State (this story)
```
                        ┌─────────────────────────────────────────┐
                        │              public/index.html            │
                        │  Books tab: [Availability▾][Sort▾][Reset]  │
                        │  books-list table + pagination controls    │
                        └───────────────┬─────────────────────────┘
                                        │ user interaction
                                        ▼
                        ┌─────────────────────────────────────────┐
                        │         src/client/app.ts                │
                        │  loadBooks(state) builds query string     │
                        │  from { availability, sort, page,         │
                        │  pageSize } and re-fetches on any change   │
                        │  (resetting page to 1 on filter/sort       │
                        │  change per FR7)                           │
                        └───────────────┬─────────────────────────┘
                                        │ GET /api/books?availability=..&sort=..&page=..&pageSize=..
                                        ▼
                        ┌─────────────────────────────────────────┐
                        │         src/routes/books.ts               │
                        │  1. parseBooksQuery()  → validate params   │
                        │  2. buildBooksQuery()  → WHERE + ORDER BY  │
                        │     (LEFT JOIN loans, derives availability)│
                        │  3. run COUNT(*) for total (pre-pagination)│
                        │  4. apply LIMIT/OFFSET                     │
                        │  5. shape response { books, page,          │
                        │     pageSize, total, totalPages }          │
                        └───────────────┬─────────────────────────┘
                                        │ SQL (LEFT JOIN, no schema change)
                                        ▼
                        ┌─────────────────────────────────────────┐
                        │   books (unchanged incl. is_available)     │
                        │   loans (unchanged; returned_date IS NULL  │
                        │          = open/active loan)               │
                        └─────────────────────────────────────────┘
```

### 1.3 New/Changed Components

| Component | Responsibility | Change type |
|---|---|---|
| `../../src/routes/books.ts` — `GET /` handler | Parse & validate `availability`, `sort`, `page`, `pageSize`; build single combined SQL query (join + filter + sort + count + paginate); shape paginated response | Changed (query layer rewritten; POST handler untouched) |
| `../../src/routes/books.ts` — query builder helpers (new, colocated or in a small module e.g. `src/routes/booksQuery.ts`) | Pure functions: `parseAvailability`, `parseSort`, `parsePagination`, `buildBooksSql()` returning `{ sql, params, countSql, countParams }` | New |
| `../../public/index.html` (Books section) | Add Availability `<select>`, Sort `<select>`, Reset button, and a pagination control row below `#books-list` | Changed |
| `../../src/client/app.ts` — `loadBooks()` | Rewritten to accept current filter/sort/page state, build query string, call `/api/books`, read new paginated response shape, render table + pagination | Changed |
| `../../src/client/app.ts` — `loadAvailableBooksSelect()` (Issue Book tab) | Must be updated to read `data.books` from the new response shape instead of treating the response as a bare array (per T4 note); this call always requests the unfiltered/unpaginated set — see §3.2 | Changed (compatibility fix only, no new behavior) |
| `../../src/routes/loans.ts` | **No changes.** Issue/return logic and the `books.is_available` column stay exactly as-is; the API layer derives availability from `loans` independently for the books list query | Unchanged (explicitly out of scope) |

---

## 2. HLD — Functional Changes Per Story

### Tables
- `books` — read-only for this story; no schema change. `is_available`
  column remains but the **books list response** no longer trusts it —
  availability shown to the librarian is derived via `LEFT JOIN loans`
  (open loan present ⇒ Not available). This affects only what
  `GET /api/books` reports, not how the column is written.
- `loans` — read-only for this story; queried via
  `LEFT JOIN loans ON loans.book_id = books.id AND loans.returned_date IS NULL`.
  No writes, no schema change.
- `members` — untouched.

### Endpoints
- `GET /api/books` — **changed**: new optional query params
  `availability`, `sort`, `page`, `pageSize`; response shape changes
  from a bare array to a paginated envelope (breaking change, see
  §3.1 and Edge Cases).
- `POST /api/books` — **unchanged**.
- `POST /api/loans/issue`, `POST /api/loans/return`, `GET /api/loans` —
  **unchanged**. They continue to read/write `books.is_available`
  exactly as today.

### UI Screens Affected
- **Books tab** (`../../public/index.html` `#books` section /
  `src/client/app.ts` `loadBooks`): adds Availability filter, Sort
  control, Reset Filters button, and pagination controls
  (Prev/Next + page indicator). Table rendering logic unchanged
  (same columns: Title, Author, ISBN, Status).
- **Issue Book tab** (`loadAvailableBooksSelect`): no visible UI
  change, but its `fetch('/api/books')` call must be updated to
  unwrap the new `{ books, ... }` envelope — otherwise it silently
  breaks (calling `.filter` on an object throws).

---

## 3. LLD

### 3.1 API Contract — `GET /api/books`

**Query parameters** (all optional):

| Param | Values | Default | Notes |
|---|---|---|---|
| `availability` | `available` \| `not_available` | *(none — no filter)* | Any other value is ignored (treated as absent), per FR/AC validation; case-sensitive lowercase values as listed (UI always sends these exact strings) |
| `sort` | `title` \| `author` | `title` | Any other/invalid value falls back to `title` (default sort), never errors |
| `page` | positive integer | `1` | Non-numeric, ≤ 0, or non-integer → coerced to `1` |
| `pageSize` | positive integer | `20` | Non-numeric, ≤ 0, or non-integer → coerced to `20`; capped at `100` to prevent unbounded queries (sane cap per T5) |

**Response shape (new — replaces bare array):**
```jsonc
{
  "books": [
    {
      "id": 1,
      "title": "Clean Code",
      "author": "Robert C. Martin",
      "isbn": "9780132350884",
      "is_available": 1        // derived from loans join, 1 = available, 0 = not available
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 47,                  // total matching rows BEFORE pagination, AFTER filter
  "totalPages": 3
}
```
- `is_available` in each book row is **computed** by the query
  (`CASE WHEN active_loan.book_id IS NULL THEN 1 ELSE 0 END`), not
  read from the stored column, so the response stays honest even if
  the stored column and loans table were ever to drift.
- Field name `is_available` is kept (not renamed) to minimize churn
  in `app.ts` rendering code (`b.is_available` check in `loadBooks`
  and the filter in `loadAvailableBooksSelect` keep working
  unchanged once the array is unwrapped from `data.books`).

**Example requests:**
```
GET /api/books                                      → default: all books, Title A-Z, page 1, pageSize 20
GET /api/books?availability=available                → only available books, Title A-Z
GET /api/books?sort=author                            → all books, Author A-Z (case-insensitive)
GET /api/books?availability=not_available&sort=author&page=2&pageSize=10
                                                       → combined filter+sort+pagination (FR4, FR6)
GET /api/books?availability=bogus&sort=xyz            → falls back to no filter + default sort (T5)
```

### 3.2 Query Builder Design

New pure helper (colocated in `../../src/routes/books.ts`, or extracted to
`src/routes/booksQuery.ts` if the team prefers separation — either
is acceptable; no new file is *required*):

```ts
type Availability = 'available' | 'not_available' | undefined;
type Sort = 'title' | 'author';

function parseAvailability(raw: unknown): Availability {
  return raw === 'available' || raw === 'not_available' ? raw : undefined;
}

function parseSort(raw: unknown): Sort {
  return raw === 'author' ? 'author' : 'title'; // default: title
}

function parsePagination(rawPage: unknown, rawPageSize: unknown): { page: number; pageSize: number } {
  const page = Number.isInteger(Number(rawPage)) && Number(rawPage) > 0 ? Number(rawPage) : 1;
  const pageSizeRaw = Number.isInteger(Number(rawPageSize)) && Number(rawPageSize) > 0 ? Number(rawPageSize) : 20;
  const pageSize = Math.min(pageSizeRaw, 100); // sane cap
  return { page, pageSize };
}

function buildBooksQuery(availability: Availability, sort: Sort) {
  const whereClauses: string[] = [];
  if (availability === 'available') whereClauses.push('active_loan.book_id IS NULL');
  if (availability === 'not_available') whereClauses.push('active_loan.book_id IS NOT NULL');
  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const orderBy = sort === 'author'
    ? 'ORDER BY b.author COLLATE NOCASE ASC, b.title COLLATE NOCASE ASC'
    : 'ORDER BY b.title COLLATE NOCASE ASC';

  const fromJoin = `
    FROM books b
    LEFT JOIN loans active_loan
      ON active_loan.book_id = b.id AND active_loan.returned_date IS NULL
  `;

  const selectSql = `
    SELECT b.id, b.title, b.author, b.isbn,
           CASE WHEN active_loan.book_id IS NULL THEN 1 ELSE 0 END AS is_available
    ${fromJoin}
    ${where}
    ${orderBy}
    LIMIT ? OFFSET ?
  `;
  const countSql = `SELECT COUNT(*) AS total ${fromJoin} ${where}`;

  return { selectSql, countSql };
}
```

**Handler flow (`router.get('/', ...)`):**
1. `parseAvailability(req.query.availability)`, `parseSort(req.query.sort)`,
   `parsePagination(req.query.page, req.query.pageSize)`.
2. `buildBooksQuery(availability, sort)` → single SQL shape reused for
   both the count and the page query (FR4: one query builder, both
   conditions applied together, not two independent code paths — this
   directly implements T3).
3. Run `countSql` → `total`; compute `totalPages = Math.ceil(total / pageSize)`
   (0 when `total === 0`, avoiding `0/x` → `NaN` edge cases by guarding
   `total === 0 ? 0 : Math.ceil(...)`).
4. Run `selectSql` with `[pageSize, (page - 1) * pageSize]` → `books`.
5. `res.json({ books, page, pageSize, total, totalPages })`.

**Why COUNT query before LIMIT/OFFSET, not JS-side filtering:** FR6
requires filter/sort applied to the **full result set** before
pagination; running `COUNT(*)` with the same `WHERE` (derived from the
same `buildBooksQuery` inputs) against SQLite guarantees `total` and
`totalPages` reflect the filtered set, not the raw table.

`loadAvailableBooksSelect()` in `app.ts` calls `GET /api/books` with no
query params but must not be paginated to 20 items if the library has
more books available for issuing. Two acceptable options, either is
fine to implement — the Developer Agent should pick one and note the
choice in Known Limitations if capped:
  - (a) pass `pageSize` large enough to be effectively "all" (e.g. `?pageSize=100`, matching the pagination cap), or
  - (b) add a small opt-out (e.g. `?pageSize=0` meaning "no limit") — **not required by this story's scope**, prefer (a) for simplicity.

### 3.3 Frontend Component Changes

**`../../public/index.html`** — inside `<section id="books">`, between the
add-book form and `#books-list`:
```html
<div id="books-controls">
  <label for="availability-filter">Availability:</label>
  <select id="availability-filter">
    <option value="">All</option>
    <option value="available">Available</option>
    <option value="not_available">Not available</option>
  </select>

  <label for="sort-select">Sort by:</label>
  <select id="sort-select">
    <option value="title">Title (A-Z)</option>
    <option value="author">Author (A-Z)</option>
  </select>

  <button type="button" id="reset-filters-btn">Reset Filters</button>
</div>
<div id="books-list"></div>
<div id="books-pagination"></div>
```

**`../../src/client/app.ts`** — state + rewritten `loadBooks`:
```ts
let booksState = { availability: '', sort: 'title', page: 1, pageSize: 20 };

async function loadBooks(): Promise<void> {
  const params = new URLSearchParams();
  if (booksState.availability) params.set('availability', booksState.availability);
  params.set('sort', booksState.sort);
  params.set('page', String(booksState.page));
  params.set('pageSize', String(booksState.pageSize));

  const res = await fetch(`/api/books?${params.toString()}`);
  const data = await res.json() as { books: Book[]; page: number; pageSize: number; total: number; totalPages: number };
  renderBooksTable(data.books);
  renderBooksPagination(data);
}

function onFilterOrSortChange(): void {
  booksState.availability = (document.getElementById('availability-filter') as HTMLSelectElement).value;
  booksState.sort = (document.getElementById('sort-select') as HTMLSelectElement).value;
  booksState.page = 1; // FR7 / AC6: any filter or sort change resets to page 1
  loadBooks();
}

function onResetFilters(): void {
  booksState = { availability: '', sort: 'title', page: 1, pageSize: 20 };
  (document.getElementById('availability-filter') as HTMLSelectElement).value = '';
  (document.getElementById('sort-select') as HTMLSelectElement).value = 'title';
  loadBooks(); // FR5 / AC7
}
```
- `renderBooksTable` = existing table-rendering body extracted
  unchanged from current `loadBooks` (same columns/markup).
- `renderBooksPagination(data)` renders Prev/Next buttons + "Page X of
  Y" text; Prev disabled when `page === 1`, Next disabled when
  `page === totalPages` (or `totalPages === 0`); clicking Prev/Next
  only mutates `booksState.page` (not filter/sort) and re-calls
  `loadBooks()` — pagination navigation does **not** reset to page 1.
- `loadAvailableBooksSelect()` updated to `const data = await res.json() as { books: Book[] }` then `data.books.filter(...)`.

### 3.4 Validation Logic
- Invalid `availability` → ignored (no filter), never a 400/500.
- Invalid `sort` → falls back to `title`, never a 400/500.
- Invalid/missing/non-positive `page` or `pageSize` → coerced to
  defaults (`1` / `20`), never a 400/500.
- `pageSize` capped at 100 regardless of requested value.
- Empty result set (0 matching books) → `books: []`, `total: 0`,
  `totalPages: 0`; frontend renders the existing
  `<p class="empty">No books added yet.</p>` message (extend the
  empty-check to also cover "no books match the current filter" —
  same code path, message text can stay generic or be refined by the
  Developer Agent, e.g. "No books match the selected filter.").

---

## 4. Wireframes

### Books Tab — Default View (no filter, page 1)
```
┌─────────────────────────────────────────────────────────────────┐
│ Books                                                            │
│ ┌───────────────────────────────────────────────────────────┐   │
│ │ Add New Book:  [Title] [Author] [ISBN]  [Add Book]         │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│ Availability: [All        ▾]   Sort by: [Title (A-Z) ▾]  [Reset Filters] │
│                                                                   │
│ ┌───────────┬────────────┬──────────────┬───────────┐           │
│ │ Title     │ Author     │ ISBN         │ Status    │           │
│ ├───────────┼────────────┼──────────────┼───────────┤           │
│ │ Clean...  │ Robert...  │ 97801...     │ Available │           │
│ │ Dune      │ Frank H... │ 97804...     │ Issued    │           │
│ │ ...       │ ...        │ ...          │ ...       │           │
│ └───────────┴────────────┴──────────────┴───────────┘           │
│                                                                   │
│                  [< Prev]   Page 1 of 3   [Next >]               │
└─────────────────────────────────────────────────────────────────┘
```

### Books Tab — Filtered + Sorted (Availability=Available, Sort=Author)
```
┌─────────────────────────────────────────────────────────────────┐
│ Availability: [Available   ▾]   Sort by: [Author (A-Z) ▾]  [Reset Filters] │
│ ┌───────────┬────────────┬──────────────┬───────────┐           │
│ │ Title     │ Author     │ ISBN         │ Status    │           │
│ ├───────────┼────────────┼──────────────┼───────────┤           │
│ │ Dune      │ Frank H... │ 97804...     │ Available │           │
│ │ ...       │ ...        │ ...          │ Available │           │
│ └───────────┴────────────┴──────────────┴───────────┘           │
│                  [< Prev]   Page 1 of 1   [Next >]  (disabled)   │
└─────────────────────────────────────────────────────────────────┘
```

### Books Tab — No Matching Results
```
┌─────────────────────────────────────────────────────────────────┐
│ Availability: [Not available▾]  Sort by: [Title (A-Z) ▾]  [Reset Filters] │
│                                                                   │
│                No books match the selected filter.               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Self-Review Findings

| # | Finding | Severity | Recommendation |
|---|---|---|---|
| 1 | Response shape change on `GET /api/books` (array → envelope object) is a breaking change consumed by **two** call sites (`loadBooks`, `loadAvailableBooksSelect`). If the Developer Agent misses updating `loadAvailableBooksSelect`, the Issue Book tab silently breaks (`.filter is not a function` on an object). | HIGH | Both call sites must be updated in the same PR; add a manual check of the Issue Book tab to the T10 verification pass (already implied by impl-plan T4 note, reiterated here for visibility). |
| 2 | `pageSize` is user-controlled; without a cap, a request like `?pageSize=999999` could force SQLite to scan/return the whole table repeatedly, degrading performance on larger datasets. | MEDIUM | Cap `pageSize` at 100 server-side (included in §3.2/§3.4 design) regardless of client input. |
| 3 | `COLLATE NOCASE` in SQLite performs ASCII-only case folding, not full Unicode case-insensitivity. For the current dataset (Latin-script author names) this satisfies FR2/AC2, but it is a latent limitation if non-ASCII author names are introduced later. | LOW | Acceptable for current scope; note as a known limitation in the Dev PR, no action needed now (no NFR requires Unicode collation). |
| 4 | Deriving availability via `LEFT JOIN loans ... returned_date IS NULL` versus trusting `books.is_available` means the two can theoretically diverge if a bug elsewhere ever leaves them out of sync — the API would now report the *join-derived* truth while other UI (e.g., Issue Book flow validation in `loans.ts`) still checks the stored column. | MEDIUM | Acceptable per requirements (FR1/Q1 explicitly mandate the join) and impl-plan's explicit reconciliation decision; both mechanisms currently stay in sync because `loans.ts` updates the column on every issue/return. Flag as a follow-up story if the app ever needs a single source of truth (e.g., drop the stored column and always derive) — out of scope here. |
| 5 | `total`/`totalPages` require a second SQL round trip (`COUNT(*)` query) in addition to the page query. For the current small SQLite dataset this is negligible, but it's worth noting as the query count doubles per `GET /api/books` call. | LOW | Acceptable given NFRs state no new performance requirements; do not optimize further (e.g., window functions) unless a real bottleneck is observed. |
| 6 | No new authorization/access-control checks are introduced, consistent with NFR ("no new security requirements"); the endpoint remains unauthenticated exactly as today. | LOW (informational) | No action — confirms no regression in access behavior. |
| 7 | Query parameters are only ever interpolated as **prepared statement parameters** (`?` placeholders via `better-sqlite3`), never string-concatenated into SQL — no SQL injection risk introduced by the new `availability`/`sort` handling (sort/availability select the *fixed* ORDER BY/WHERE clause text via the allow-listed `parseSort`/`parseAvailability` functions, not raw user strings). | LOW (informational) | Developer Agent must preserve this pattern: never concatenate `req.query.sort`/`availability` directly into SQL text; always map through the allow-list functions first. |

## Overall Decision

**APPROVED** — no HIGH-severity blocking issues; finding #1 (HIGH) is
a coordination requirement for the Developer Agent (update both
client call sites together), not a design flaw, and is already
explicitly called out in the implementation plan (T4/T7). Proceed to
Stage 4 (Developer Agent) once a human confirms this design.
