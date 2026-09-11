# Requirements — KAN-6: Renew an issued book with rules

## Story Overview
- **Story ID:** KAN-6
- **Epic:** KAN-1 — Circulation Management: due dates, renewals, and overdue tracking
- **Summary:** Renew an issued book with rules
- **Description:** As a librarian, I want to renew an issued book, so that members can extend borrowing time without returning and re-issuing.
- **Status:** To Do
- **Assignee:** Unassigned
- **Story Points:** [pending] — no story-points field exists on this Jira instance

## Functional Requirements
- The system must provide a way for a librarian to renew an active (not yet returned) loan.
- When a librarian renews an active loan, the loan's `due_date` must be extended by the default loan period. The default loan period is **14 days**, matching the existing `calculateDueDate()` function used for initial issuance (`src/validators.ts`, line 5-9); no separate renewal-period value exists in the codebase, so renewal reuses this same 14-day constant unless a human specifies otherwise.
- Each renewal must increment a renewal count associated with the loan. **No `renewal_count` (or equivalent) column currently exists in the `loans` table** (`src/db/database.ts`); this column will need to be added as part of implementation, consistent with the "reuse existing `loans` table only, no schema changes" constraint from Q1 — see Clarifications and Decisions for how this tension is flagged.
- The system must enforce a maximum allowed number of renewals per loan. **No maximum-renewals constant or configuration exists anywhere in `src/`.** **Assumed default (human-authorized):** the maximum allowed number of renewals per loan is **2**. This value was not found in Jira or the codebase — it is a human-authorized default supplied at the requirements checkpoint, not a discovered fact.
- When a renewal is attempted on a loan that has already reached the maximum allowed renewals, the system must block the renewal and return/display a clear message to the librarian.
- When a renewal is attempted on a loan that is overdue (`due_date` in the past, `returned_date IS NULL`, matching the existing overdue definition used in `GET /api/loans/overdue`, `src/routes/loans.ts`), the system must block the renewal. **No overdue-renewal policy (block vs. override, and any override mechanics) currently exists in the codebase.** **Assumed default (human-authorized):** the policy is block-only — an overdue loan cannot be renewed, with no override path in this story; any future override mechanism is explicitly deferred to a future story. This is a human-authorized default supplied at the requirements checkpoint, not a discovered fact.
- This is an API + UI feature (per Q3): a UI control/action for triggering a renewal must be provided to the librarian, alongside the corresponding API endpoint (e.g., a new `POST /api/loans/renew`-style endpoint, following the existing `issue`/`return` endpoint pattern in `src/routes/loans.ts`).
- Renewal is a librarian-performed action only; there is no member-facing self-service renewal capability (per Q1/Q4/Q5 answers).

## Non Functional Requirements
- **Access control:** Renewal is a librarian-only action; there is no member self-service renewal path (per Q4 answer).
- **Audit logging:** **Assumed default (human-authorized):** audit logging is not required for this story. This was not stated in Jira or found in the codebase — it is a human-authorized default supplied at the requirements checkpoint.
- **Performance:** **Assumed default (human-authorized):** no special performance SLA applies; the renewal action should meet the application's standard response time. This was not stated in Jira or found in the codebase — it is a human-authorized default supplied at the requirements checkpoint.
- **Security:** No additional security requirement beyond librarian-only access was stated.

## Acceptance Criteria
1. Given a loan is active, when the librarian renews it, then the due date is extended by the default loan period and a renewal count is incremented.
2. Given a loan has reached the maximum allowed renewals, when renewal is attempted, then the system blocks the renewal and shows a clear message.
3. Given a loan is overdue, when renewal is attempted, then the system blocks renewal (or requires override) based on configured policy.

## Clarifications and Decisions
- **Constraints (Q1):** Must reuse the existing `loans` table only — no schema changes. Note: this constraint is in tension with the need for a renewal-count field, since no such column exists today (`src/db/database.ts`); this must be resolved during planning/design (e.g., adding a column is a minimal schema change vs. a new table, which the constraint does not rule out — flagged for the Planner/Design stage to decide, not assumed here).
- **Dependencies (Q2):** Depends on the existing "issue a book" / due-date logic already being in place. This dependency is confirmed present: `POST /api/loans/issue` and `calculateDueDate()` already exist in `src/routes/loans.ts` and `src/validators.ts`. Exact numeric/policy values for default loan period, maximum renewals, and overdue policy were not specified by the human. Of these, the default loan period (14 days) was found as an existing constant in the codebase (`calculateDueDate()`, `src/validators.ts`) and is used above. Maximum renewals and overdue policy have no existing codebase value; **Assumed default (human-authorized):** maximum renewals = 2, and overdue policy = block-only with no override in this story (override deferred to a future story).
- **Definition of done (Q3):** This story is in scope for both API and UI (not API-only) — a librarian-facing UI action for renewal is required in addition to the backend endpoint. Noting as context that `tester-agent` runs automated testing later in this pipeline regardless of DoD wording. **Assumed default (human-authorized):** automated tests ARE required as part of this story's own definition of done.
- **NFRs (Q4):** Renewal is a librarian-only action; no member self-service. **Assumed default (human-authorized):** no audit-logging requirement and no special response-time requirement apply to this story — standard application response time is sufficient.
- **Out of scope (Q5):** Member self-service renewal is explicitly excluded from this story. **Assumed default (human-authorized):** the overdue-block "override" path (referenced in Acceptance Criterion 3) is confirmed deferred to a later story and is out of scope for this story.

## Out of Scope
- Member self-service renewal (members initiating their own renewals) — explicitly excluded per Q5 answer.
- Whether the overdue "override" mechanism is a separate future story — **Assumed default (human-authorized):** confirmed out of scope for this story and deferred to a future story.
