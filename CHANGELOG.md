# Changelog

All notable changes to this project are recorded here, one entry per
completed Agentic SDLC pipeline batch.

## KAN-18 — Filter/sort books by availability and author — 2026-09-10

- **Epic:** KAN-2
- **Summary:** Added Availability filter (Available / Not available) and
  Title/Author sort to the books list, combinable with pagination, via an
  API-driven `GET /api/books` query-parameter interface with a Reset
  Filters action restoring the default Title A-Z view.
- **Dev PR:** [#6](https://github.com/VikramKamboz/library-management-app-copilot-capstone/pull/6) (merged)
- **Requirements PR:** [#3](https://github.com/VikramKamboz/library-management-app-copilot-capstone/pull/3) (merged)
- **Implementation Plan PR:** [#4](https://github.com/VikramKamboz/library-management-app-copilot-capstone/pull/4) (merged)
- **Design PR:** [#5](https://github.com/VikramKamboz/library-management-app-copilot-capstone/pull/5) (merged, self-review APPROVED)
- **Test Automation PR:** [#4](https://github.com/VikramKamboz/library-management-playwright/pull/4) (test repo, 5 happy-path Gherkin scenarios)
- **Test Results:** 5 passed, 0 failed (see `tests/evidence/test-run-KAN-18-20260910-152135.log`)
- **Deployment:** Confirmed reachable at http://localhost:5050
- **Confluence Batch Summary:** https://vikramkamboj7.atlassian.net/wiki/spaces/AISDLC/pages/11173889/KAN-18+-+Filter+sort+books+by+availability+and+author+-+Batch+Summary
