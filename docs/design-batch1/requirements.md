# Requirements: KAN-18 — Filter/sort books by availability and author

## Story Overview
- **Story ID:** KAN-18
- **Epic:** KAN-2
- **Status:** To Do
- **Assignee:** Unassigned
- **Story Points:** Not set
- **Summary:** As a librarian, I want to filter and sort the books
  list, so that I can quickly identify available items and browse
  effectively.

## Functional Requirements
- FR1: Provide an Availability filter on the books list with options
  Available / Not available.
  - A book is **Available** if it has no currently open/active loan.
  - A book is **Not available** if it has a currently open/active
    loan.
  - Availability is derived by joining `books` with `loans` and
    checking for an open/active loan record.
- FR2: Provide sorting on the books list by Title or Author.
  - Default sort when no sort is applied: **Title, A-Z**.
  - Author sort is **case-insensitive** and sorts on the full author
    name exactly as stored (no last-name parsing/extraction).
- FR3: Filtering and sorting are implemented as an **API-driven**
  feature using query parameters against the `books` endpoint
  (joined with `loans` for availability), not client-side-only
  filtering.
- FR4: Filter and sort ARE combinable simultaneously — e.g., a
  request may specify Availability=Available AND sort=author at the
  same time, and both conditions must apply together.
- FR5: Provide a Reset Filters action that restores the default
  (unfiltered, default-sorted — Title A-Z) books list view.
- FR6: Filtering/sorting is applied to the full result set **before**
  pagination is applied.
- FR7: Any change to the active filter or sort option resets the
  current view/request to **page 1** of results.
- FR8: Filtering and sorting operate only on existing books data
  (title, author, availability derived from loans) — no new data
  fields are required.

## Non Functional Requirements
- No new performance requirements beyond standard existing
  application behavior; queries should use existing `books` and
  `loans` tables without introducing new indexes/schema unless
  needed for correctness.
- No new security or access-control requirements — filtering/sorting
  must not change existing authorization/access behavior for the
  books list.

## Acceptance Criteria
1. Given I am on the books list, when I apply an Availability filter
   (Available / Not available), then only matching books are shown,
   where availability is determined by presence/absence of an
   active loan.
2. Given I am on the books list, when I sort by Title or Author, then
   the list order updates accordingly (Author sort is case-insensitive
   on the full stored author name).
3. Given I am on the books list with no filter/sort applied, then the
   default view is sorted by Title A-Z.
4. Given I apply both an Availability filter and a sort option at the
   same time, then both are applied together (combined filter + sort).
5. Given filtered/sorted results span multiple pages, when filtering
   and sorting are applied, then they are applied to the full result
   set before pagination is computed.
6. Given I am viewing a filtered/sorted, paginated list on a page
   other than 1, when I change the filter or sort option, then the
   view resets to page 1.
7. Given filters are applied, when I reset filters, then the default
   (unfiltered, Title A-Z sorted) list view is restored.

## Clarifications and Decisions
- Q1 Technical constraints: API-driven implementation via query
  parameters against the `books` table, joined with `loans` to
  determine availability. A book is "Available" if it has no
  currently open/active loan; "Not available" if it has an active
  loan.
- Q1a Filter/sort combination: Filter and sort ARE combinable
  simultaneously (e.g., Availability=Available AND sort by Author).
- Q1b Default sort: Title A-Z when no sort is applied.
- Q1c Author sort behavior: Case-insensitive, sorted by the full
  author name as stored (no last-name parsing).
- Q1d Pagination interaction: Filtering/sorting is applied before
  pagination; any change to filter or sort resets the view to page 1.
- Q2 Dependencies: None — this story can be built independently of
  other KAN-2 stories.
- Q3 Definition of done: Working code merged; no formal automated
  test requirement at this stage (automated test generation happens
  later in the pipeline at Stage 8-9 via the Tester Agent in the
  separate test repo).
- Q4 Performance/security requirements: None specified beyond
  standard existing app behavior; no new access-control restrictions.
- Q5 Out of scope items: Saved filter presets, sorting by additional
  fields (e.g., genre, publisher), and exporting filtered results.

## Out of Scope
- Saved filter presets.
- Sorting by additional fields such as genre or publisher.
- Exporting filtered results.
