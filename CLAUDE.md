# CLAUDE.md

This repo implements an **Agentic SDLC Pipeline** natively in Claude
Code: Claude drives planning, design, development, review, testing,
and documentation for a Jira story `KAN-{{NUMBER}}`, with human
approval at nearly every stage. Two repos are involved: this app
repo (development) and a separate Playwright/TypeScript test
automation repo (`GITHUB_TEST_REPO_NAME`).

This is the Claude Code native port of the same pipeline originally
built for GitHub Copilot under `.github/` (see
`CLAUDE-CODE-MIGRATION-CONTEXT.md` for the porting rationale and
`AGENTIC-SDLC-IMPLEMENTATION.md` for the original's behavior spec).
Behavior is preserved; only the mechanics change to use Claude
Code's real subagents, Agent Skills, hooks, and slash commands
instead of documentation-only conventions.

## Folder Structure
- `.claude/agents/` — stage agents + orchestrator, real Claude Code
  subagents invoked via the Task tool (includes the former
  Requirements/Planner/Design subagents, now their own files, called
  only by `docs-agent`)
- `.claude/skills/<name>/SKILL.md` — reusable technical actions
  (Agent Skills), invoked by agents
- `.claude/templates/` — exact output section structure per doc type
- `.claude/commands/` — slash-command entry points into the pipeline
- `.claude/settings.json` — real executable hooks (`PreToolUse`,
  `PostToolUse`, `Stop`, etc.) replacing the old on_start/on_complete
  prose convention
- `.claude/rules/pipeline-rules.md` — shared numbered guardrails,
  referenced from every agent's own Rules section (full text folded
  into this file below; kept as a standalone file too for direct
  agent references)
- `.claude/config/pipeline-config.md` — pipeline configuration
  (formats, naming, stage config)
- `docs/{{STORY_ID}}/` — generated SDLC documentation, per story
- `src/` — application source code (Node.js/Express/TypeScript)

## Coding Standards
- Prefer TypeScript/JavaScript for this app; Python only if asked
- JavaScript/TypeScript: camelCase
- Use meaningful, descriptive function and variable names
- Every function must include error handling

## Security
- Never hardcode credentials, tokens, or passwords
- Always read secrets from environment variables
- See `.env.example` for required variables

## Pointers
- Pipeline control: `.claude/agents/orchestrator-agent.md`
- Configuration values: `.claude/config/pipeline-config.md`
- Shared hooks: `.claude/settings.json`
- Environment variables: `.env.example`

## Behavior
- Always ask clarifying questions before making assumptions
- Always wait for human approval at checkpoints before proceeding
- Never invent app data — tables are only: books, members, loans
- Jira is READ-ONLY — only `jira-agent` talks to it, and only to
  browse/fetch, never to create/update/delete an issue. See Rule 1
  below for full detail.

---

## Pipeline Rules

Every agent and subagent in this pipeline follows these rules. They
are referenced from each agent's own `## Rules` section rather than
repeated inline, so a guardrail only ever needs to change in one
place.

### 1. Jira — Read-Only, No Exceptions
- Only `jira-agent` may call the Jira REST API, and only via the
  `jira-reader` skill
- `jira-reader` is GET-only: browse the backlog, fetch one story's
  details. No agent — `jira-agent` included — may create, update,
  transition, comment on, or delete a Jira issue
- If a stage would normally reflect a status change back to Jira
  (e.g. "story now in development"), it must NOT do this
  automatically — tell the human to update Jira manually if needed
- No agent other than `jira-agent` may reference Jira credentials or
  attempt to reach the Jira API directly

### 2. GitHub — Scoped Write Access
- Only `git-committer` may commit/push; only `pr-creator` may open a
  PR; only `pr-commenter` may post PR comments — no agent writes git
  history or calls the GitHub API outside these skills
- No agent ever merges a PR — merging is always a manual human
  action, confirmed back to the agent in chat
- No agent pushes directly to `main`/`GITHUB_DEFAULT_BRANCH` —
  always via a feature branch per `pipeline-config.md` naming rules
- Requirements/Planner/Design subagents never commit or open a PR
  (local files only) — see `docs-agent.md`

### 3. Confluence — Single Page, Scoped Space
- Only `confluence-agent` may call `confluence-publisher`
- May only create or update the one Batch Summary page per story, in
  space `AISDLC` — never delete pages, never touch pages outside
  that space or that don't match the story's title format

### 4. Data Integrity — Never Invent
- Every fact in a generated document must trace back to a real
  source: a Jira API response, a file actually read, or a human's
  answer in chat — never fabricated
- If information is genuinely missing, mark it `[pending]` (or ask
  the human) — never guess or fill a gap silently
- App schema constraint: tables are only `books`, `members`,
  `loans` — never invent additional tables, columns, or endpoints

### 5. Security
- Never hardcode credentials, tokens, or passwords in generated code
  or docs — always read from environment variables
- `.env` is never read into context, written to, or committed by any
  skill (enforced in `file-writer` and `git-committer`)

### 6. Checkpoints
- Never skip a human checkpoint silently, even on a stage marked
  skippable in `pipeline-config.md` — skipping still requires
  explicit human confirmation, and gets logged in
  `docs/{{STORY_ID}}/pipeline-log.md` with a note that it was
  skipped
- Nothing that posts or publishes externally (PR comments, Confluence
  page) proceeds without the human seeing the exact content first
  and confirming

### 7. Scope Discipline
- Each stage only touches the files it owns — e.g. Design Subagent
  never edits `impl-plan-{{STORY_ID}}.md`, Developer Agent only
  implements what's in the approved design/plan, not extra
  "while I'm here" changes
- A rejected checkpoint routes back to the agent that owns the
  rejected file — it does not restart the whole pipeline
- On REJECT: ask what specifically is wrong, then make a targeted
  edit to just the affected section(s) — never regenerate an entire
  document/review from scratch on a REJECT. This keeps revisions
  fast and makes it obvious to the human what actually changed
  between attempts.
