# Implementation Plan: KAN-19 — Search Members by Name or Email

## Overview

This document outlines the implementation plan for **KAN-19: Search members by name or email**, which is part of Epic **KAN-2: Search, Filter, and Quick Find for books and members**.

**Story Description:** As a librarian, I want to search for members by name or email so that I can quickly find a member's record when they visit the library.

### Baseline Context

- The application currently has a `members` table in the SQLite database with columns: `id`, `name`, `email`
- **Existing functionality:** add/view members
- Tech stack: Node.js + Express + TypeScript backend, SQLite (node:sqlite), plain HTML/CSS/vanilla TypeScript frontend
- Port: 5050
- Existing route: `/api/members` (GET all, POST create)
- Existing validator: `isValidEmail` in `../../src/validators.ts`
- Existing client: `loadMembers()` function in `../../src/client/app.ts`, renders all members into a table
- Existing HTML: `members` tab section with adding form and `members-list` div

---

## 1. Implementation Sequence

Since this is a single story implementation, the sequence is straightforward:

**Story to Implement:** KAN-19

**Rationale:**
- KAN-19 is a standalone feature that enhances the existing member management capability
- It does not depend on any other pending stories
- It only requires the existing `members` table, which is already part of the baseline application
- This feature provides immediate value to librarians by improving member lookup efficiency

---

## 2. Dependency Analysis

**Pre-requisites:**
- Existing `members` table in the database (with columns: `id`, `name`, `email`) — already exists in baseline
- Existing member view functionality (client: `loadMembers()`, server: `GET /api/members`) — already exists in baseline

**Dependencies on Other Stories:**
- **None** — KAN-19 is independent of all other pending stories

**Stories Dependent on KAN-19:**
- **None** — No other stories in the backlog depend on member search functionality

**Technical Dependencies:**
- No new database tables or schema changes required
- No new packages or libraries needed
- No changes to existing routes required (new route added to existing members router)

---

## 3. Logical Delivery Batches

Since this is a single story implementation, there is only one batch:

### Batch 1: Member Search Functionality

**Stories:**
- KAN-19: Search members by name or email

**Rationale:**
This batch delivers a complete, testable, and deployable feature that enhances member management by allowing librarians to quickly find members using name or email search.

**Deliverables:**

#### Backend (`../../src/routes/members.ts`)

1. New GET endpoint: `GET /api/members/search?q={term}`
2. SQL query using `LIKE` for case-insensitive partial matches on both `name` and `email` columns
3. Return empty array when no matches found
4. Validate query parameter is provided (400 if missing)
5. Trim whitespace from search term before querying

#### Frontend (`../../src/client/app.ts` and `public/index.html`)

1. Add search input field to the members tab section (above the `members-list` div)
2. Implement debounced input handler (300ms delay) to call search API
3. Display filtered results in the existing members table
4. Show "No members found" message when search returns empty
5. Restore full list when search input is cleared
6. Ensure the search input has proper ARIA labels and keyboard navigation support

#### Testing

1. Unit tests for the search route handler
2. Integration tests for the API endpoint
3. Manual testing for UX and accessibility

**Estimated Effort:**
- Backend development: 2-3 hours
- Frontend development: 2-3 hours
- Testing: 1-2 hours
- **Total: 5-8 hours**

---

## 4. Implementation Notes

**Key Considerations:**
1. **Search Behavior:** The search should be case-insensitive and support partial matches (e.g., searching "john" should find "John Doe")
2. **Performance:** For large member lists, consider adding database indexes on name and email fields (Design Assistant to confirm)
3. **UX:** Provide real-time search results as the user types (debounced to avoid excessive API calls)
4. **Error Handling:** Display clear messages when no members are found or when the search fails
5. **Accessibility:** Ensure the search input has proper ARIA labels and keyboard navigation support

**Technical Details to Confirm with Design Assistant:**
- Whether to implement database indexes for optimized search performance
- API endpoint naming convention (e.g., `/api/members/search` vs query param on `/api/members`)
- Query parameter format (e.g., `?q=search_term` or `?name=search_term&email=search_term`)

---

## 5. Risk Assessment

**Low Risk:**
- This is a low-risk feature that does not modify existing data or core functionality
- It only adds a read-only search capability
- No database schema changes required
- Can be easily tested and rolled back if needed

---

## 6. Testing Strategy

**Unit Tests:**
- Test backend search logic with various inputs (empty, partial, exact matches)
- Test case-insensitive search behavior
- Test error handling for invalid inputs

**Integration Tests:**
- Test API endpoint with different query parameters
- Test frontend-backend integration
- Test search results display and empty state handling

**Manual Testing:**
- Verify search functionality with real user scenarios
- Test UX and performance with large datasets
- Verify accessibility and keyboard navigation

---

## 7. Definition of Done

KAN-19 is considered complete when:

1. Backend API endpoint for member search is implemented and tested
2. Database query logic supports case-insensitive partial matches on name and email
3. Frontend search input and results display are implemented
4. Error handling for empty results and API failures is in place
5. Unit and integration tests pass successfully
6. Manual testing confirms the feature works as expected
7. Code review is completed and approved
8. Feature is merged to main branch and deployed

---

## 8. Next Steps

1. **Design Phase:** Design Assistant to confirm technical details (table schema, API design, indexing strategy)
2. **Development Phase:** Developer Assistant to implement backend and frontend components
3. **Testing Phase:** Testing Assistant to create and execute test cases
4. **Review & Deployment:** Code review, merge, and deployment to production

---

## 9. Summary

KAN-19 is a standalone, low-risk feature that enhances member management by adding search capability. It has no dependencies on other pending stories and can be implemented immediately. The estimated effort is 5-8 hours, and the feature provides immediate value to librarians by improving member lookup efficiency.

---

**Plan Created By:** Planning Assistant  
**Date:** 2026-09-02  
**Project:** Library Management System Enhancement  
**Jira Project Key:** KAN