# Design — KAN-6: Renew an issued book with rules

## Architecture Document

**Technology approach:** No new dependencies. This story is
implemented entirely within the existing stack (Node.js, Express,
TypeScript, SQLite via `node:sqlite`, port 5050), following the
established pattern already used by `POST /api/loans/issue` and
`POST /api/loans/return` in `src/routes/loans.ts`, and reusing
`calculateDueDate()` from `src/validators.ts`. No new tables are
introduced; the only schema change is one additive column on the
existing `loans` table.

**New/changed components and responsibilities:**

| Component | File | Responsibility |
|---|---|---|
| `loans` table (schema) | `src/db/database.ts` | Add `renewal_count` column (default 0) to track renewals per loan, following the same `ALTER TABLE ... ADD COLUMN` migration pattern already used for `due_date` (KAN-5) |
| Renewal eligibility check | `src/validators.ts` | New `MAX_RENEWALS` constant and an `isRenewalEligible()`-style function that (a) rejects if `renewal_count >= MAX_RENEWALS`, (b) rejects if the loan is overdue (`due_date` in the past AND `returned_date IS NULL`) — reused overdue definition from `GET /api/loans/overdue` |
| `POST /api/loans/renew` route handler | `src/routes/loans.ts` | Looks up the active loan by `loan_id`, runs the eligibility check, on success extends `due_date` via `calculateDueDate()` and increments `renewal_count`; on failure returns a clear error identifying which rule blocked the renewal |
| Librarian UI renewal control | UI layer (loan list screen, `public/`) | Adds a "Renew" action per active loan row, calls the renewal endpoint, and displays either the new due date (success) or the specific blocking message (max renewals / overdue) returned by the API |

**Architecture diagram:**

```
┌─────────────────────────┐        POST /api/loans/renew        ┌──────────────────────────┐
│  Librarian UI            │ ───────{ loan_id }─────────────────▶│  Express Route Handler    │
│  (loan list, Renew btn)  │                                     │  src/routes/loans.ts      │
│                          │ ◀───────200 / 400 JSON──────────────│  POST /renew              │
└─────────────────────────┘                                     └──────────┬───────────────┘
                                                                            │
                                                                            ▼
                                                       ┌────────────────────────────────────┐
                                                       │ Eligibility check                    │
                                                       │ src/validators.ts                     │
                                                       │  - renewal_count >= MAX_RENEWALS(2)?  │
                                                       │  - due_date < today AND               │
                                                       │    returned_date IS NULL (overdue)?   │
                                                       └──────────────────┬────────────────────┘
                                                                          │ eligible
                                                                          ▼
                                                       ┌────────────────────────────────────┐
                                                       │ calculateDueDate(today)               │
                                                       │ src/validators.ts (existing, +14 days) │
                                                       └──────────────────┬────────────────────┘
                                                                          │
                                                                          ▼
                                                       ┌────────────────────────────────────┐
                                                       │ UPDATE loans                          │
                                                       │  SET due_date = ?, renewal_count += 1 │
                                                       │  WHERE id = ? AND returned_date IS NULL│
                                                       │ (SQLite, existing loans table)        │
                                                       └────────────────────────────────────┘
```

## HLD (High-Level Design)

**Tables affected:** `loans` only (additive column). No changes to
`books` or `members`.

**Endpoints affected:**
- New: `POST /api/loans/renew` — renews an active loan, following
  the existing `issue`/`return` pattern in `src/routes/loans.ts`.
- No changes to existing endpoints (`GET /`, `GET /overdue`,
  `POST /issue`, `POST /return`).

**UI screens affected:**
- Loan list screen: adds a "Renew" action per active (not-returned)
  loan row. On success, the row's due date updates in place. On
  block, an inline message is shown ("Maximum renewals reached" or
  "Cannot renew an overdue loan").

**Functional changes per story:**
1. Librarian triggers renewal for an active loan (UI or direct API call).
2. System checks: is `renewal_count >= 2`? If yes, block with message.
3. System checks: is the loan overdue (`due_date` in past AND
   `returned_date IS NULL`)? If yes, block with message.
4. If both checks pass: extend `due_date` by 14 days (via
   `calculateDueDate()`), increment `renewal_count` by 1.
5. No audit logging and no special performance SLA — per
   human-authorized defaults in requirements (Rule 4/pipeline-rules:
   nothing beyond what requirements/plan justify).

## LLD (Low-Level Design)

### Schema change

```sql
-- src/db/database.ts, added to initializeDatabase(), following the
-- same conditional-ALTER pattern used for due_date (KAN-5):
ALTER TABLE loans ADD COLUMN renewal_count INTEGER NOT NULL DEFAULT 0;
```

Guarded the same way as the existing `due_date` migration:

```ts
const loanColumns = db.prepare('PRAGMA table_info(loans)').all() as Array<{ name: string }>;
if (!loanColumns.some(col => col.name === 'renewal_count')) {
  db.exec('ALTER TABLE loans ADD COLUMN renewal_count INTEGER NOT NULL DEFAULT 0');
}
```

This is the only schema change. No new tables; `books` and `members`
are untouched.

### Validation / eligibility logic (`src/validators.ts`)

```ts
export const MAX_RENEWALS = 2;

export interface RenewalEligibility {
  eligible: boolean;
  reason?: 'MAX_RENEWALS_REACHED' | 'LOAN_OVERDUE';
}

export function checkRenewalEligibility(loan: {
  due_date: string;
  renewal_count: number;
  returned_date: string | null;
}): RenewalEligibility {
  if (loan.renewal_count >= MAX_RENEWALS) {
    return { eligible: false, reason: 'MAX_RENEWALS_REACHED' };
  }
  // Same overdue definition as GET /api/loans/overdue:
  // due_date < today AND returned_date IS NULL
  const today = new Date().toISOString().split('T')[0];
  if (loan.returned_date === null && loan.due_date < today) {
    return { eligible: false, reason: 'LOAN_OVERDUE' };
  }
  return { eligible: true };
}
```

### API signature — `POST /api/loans/renew`

**Request:**
```json
{ "loan_id": 12 }
```
- `loan_id`: number, required. 400 if missing (`{ "error": "loan_id is required" }`),
  matching the existing pattern in `POST /return`.

**Responses:**
- `404 Not Found` — no active loan matches `loan_id` (`returned_date IS NULL`):
  `{ "error": "Active loan not found" }`
- `400 Bad Request` — blocked by max renewals:
  `{ "error": "Maximum renewals (2) reached for this loan" }`
- `400 Bad Request` — blocked because overdue:
  `{ "error": "Cannot renew an overdue loan" }`
- `200 OK` — success:
  `{ "message": "Loan renewed successfully", "due_date": "2026-09-25", "renewal_count": 1 }`

### Route handler outline (`src/routes/loans.ts`)

```ts
router.post('/renew', (req: Request, res: Response) => {
  const { loan_id } = req.body as { loan_id?: number };
  if (!loan_id) {
    res.status(400).json({ error: 'loan_id is required' });
    return;
  }

  const loan = db.prepare(
    'SELECT * FROM loans WHERE id = ? AND returned_date IS NULL'
  ).get(loan_id) as
    | { id: number; due_date: string; renewal_count: number; returned_date: string | null }
    | undefined;
  if (!loan) {
    res.status(404).json({ error: 'Active loan not found' });
    return;
  }

  const eligibility = checkRenewalEligibility(loan);
  if (!eligibility.eligible) {
    const message = eligibility.reason === 'MAX_RENEWALS_REACHED'
      ? 'Maximum renewals (2) reached for this loan'
      : 'Cannot renew an overdue loan';
    res.status(400).json({ error: message });
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const newDueDate = calculateDueDate(today);
  db.prepare(
    'UPDATE loans SET due_date = ?, renewal_count = renewal_count + 1 WHERE id = ?'
  ).run(newDueDate, loan_id);

  res.status(200).json({
    message: 'Loan renewed successfully',
    due_date: newDueDate,
    renewal_count: loan.renewal_count + 1,
  });
});
```

Note: `calculateDueDate()` extends from a given issued-date string
by 14 days; renewal reuses it with "today" as the base date, per
requirements (renewal extension = same 14-day default loan period,
no separate renewal-period constant exists).

## Wireframes

```
+----------------------------------------------------------------+
|  Active Loans                                                   |
+----------------------------------------------------------------+
| Book              | Member         | Due Date   | Renewals |    |
|--------------------------------------------------------------- |
| The Hobbit         | J. Smith       | 2026-09-20 | 0/2   [Renew]|
| Dune                | A. Rao         | 2026-09-05 | 1/2   [Renew]|
| 1984                | B. Lee         | 2026-08-30 | 2/2   [Renew]|
+----------------------------------------------------------------+

-- After clicking [Renew] on "The Hobbit" (success case): --
+----------------------------------------------------------------+
|  [x] Loan renewed successfully. New due date: 2026-10-04         |
+----------------------------------------------------------------+
| The Hobbit         | J. Smith       | 2026-10-04 | 1/2   [Renew]|
| Dune                | A. Rao         | 2026-09-05 | 1/2   [Renew]|
| 1984                | B. Lee         | 2026-08-30 | 2/2   [Renew]|
+----------------------------------------------------------------+

-- Clicking [Renew] on "1984" (blocked: max renewals reached): --
+----------------------------------------------------------------+
|  [!] Maximum renewals (2) reached for this loan.                 |
+----------------------------------------------------------------+
| 1984                | B. Lee         | 2026-08-30 | 2/2   [Renew]|
|                                       (button disabled/greyed)   |
+----------------------------------------------------------------+

-- Clicking [Renew] on "Dune" once its due date is overdue: --
+----------------------------------------------------------------+
|  [!] Cannot renew an overdue loan.                                |
+----------------------------------------------------------------+
| Dune                | A. Rao         | 2026-09-05 | 1/2   [Renew]|
+----------------------------------------------------------------+
```

## Self-Review Findings

| Severity | Finding | Recommendation |
|---|---|---|
| MEDIUM | No authentication/authorization layer exists anywhere in the current app (checked `src/routes/loans.ts` — no auth middleware). Requirements state renewal is "librarian-only", but there is no mechanism in the codebase to actually enforce this today. | Out of scope to fix in this story (pre-existing app-wide gap, not introduced by KAN-6), but flag to the human that "librarian-only" is currently a UI-convention assumption, not an enforced access control, consistent with the rest of the app. |
| LOW | Concurrent renewal requests for the same `loan_id` could theoretically both pass the eligibility check before either UPDATE completes (race condition), double-incrementing beyond intended sequencing. | Given SQLite's default single-writer serialization and this app's low-concurrency librarian-desk usage pattern, this is non-blocking for this story; note only, no design change needed since no performance/concurrency SLA was requested. |
| LOW | The response message strings for blocked renewals are hardcoded in the route handler rather than centralized as constants alongside `MAX_RENEWALS`. | Consider moving message strings next to `MAX_RENEWALS` in `src/validators.ts` for single-source-of-truth consistency; non-blocking. |
| LOW | `renewal_count` increment logic lives in the SQL `UPDATE` statement (`renewal_count + 1`) rather than being derived from `checkRenewalEligibility()`'s output, which is a minor separation-of-concerns nit. | Non-blocking; acceptable given the existing codebase's straightforward inline-SQL style in `issue`/`return`. |

## Overall Decision

APPROVED — design stays within the existing 3-table schema with one
additive, backward-compatible column, follows the established
route/validator patterns exactly, and all self-review findings are
MEDIUM/LOW and non-blocking (the MEDIUM item is a pre-existing
app-wide gap, not introduced by this story).
