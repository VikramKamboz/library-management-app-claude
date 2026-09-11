# Jira Reader Skill

## Purpose
Fetch a single story or query the backlog from Jira via REST API.

## Used By
- jira-agent (.github/agents/jira-agent.agent.md)

## Required Environment Variables
- JIRA_URL: base URL of Jira instance
- JIRA_EMAIL: email for authentication
- JIRA_API_TOKEN: API token for authentication
- JIRA_PROJECT_KEY: project key (our project: KAN)

## Pre-flight Checks
Before making any API call:
- Verify JIRA_URL is set — if not: stop and show error
- Verify JIRA_EMAIL is set — if not: stop and show error
- Verify JIRA_API_TOKEN is set — if not: stop and show error
- If mode is single-story: verify ID matches format KAN-{{NUMBER}}
- If any check fails: show clear message and stop

## Modes

### Mode 1 — Fetch Single Story
Input: Story ID KAN-{{NUMBER}}
Steps:
1. Build auth header: Basic base64(JIRA_EMAIL:JIRA_API_TOKEN)
2. GET {{JIRA_URL}}/rest/api/3/issue/{{STORY_ID}}
3. Extract: summary, description, customfield_10016 (points),
   status.name, assignee.displayName, acceptance criteria
4. Return structured story data

### Mode 2 — Query Backlog
Input: none (queries whole KAN project)
Steps:
1. GET {{JIRA_URL}}/rest/api/3/search
   ?jql=project=KAN AND status!=Done AND issuetype=Story
   ORDER BY parent ASC
   Only issuetype=Story is returned — Sub-tasks, Tasks, and Bugs
   are excluded so the human only picks from real user stories
2. Group results by Epic
3. Return numbered list grouped by Epic for human to choose from
4. This mode is READ-ONLY — never creates or modifies issues

## Output
Mode 1: title, description, acceptance_criteria, story_points,
status, assignee, story_id
Mode 2: list of {epic, story_id, summary, status} grouped by epic
— Story-type issues only, no sub-tasks

## Error Handling
- 401 Unauthorized: → "Check JIRA_API_TOKEN in your .env file"
- 404 Not Found: → "Story KAN-{{NUMBER}} not found.
  Verify story exists in KAN project"
- 400 Bad Request: → "Invalid request. Check JIRA_URL format"
- Network timeout: retry once after 5 seconds, then show
  "Cannot reach Jira. Check JIRA_URL"
- Missing fields: return available fields, flag missing ones
- Empty backlog query result: → "No pending stories found in KAN"
