# Agentic SDLC Pipeline — Claude Code Implementation Guide (Demo Reference)

This document explains everything implemented under `.claude/` in
this repo: the **orchestrator + 7 stage agents + 3 documentation
subagents**, the **7 reusable Agent Skills**, the **real executable
hooks**, and the **slash-command entry points**. Use it as the
script/reference for demoing the Claude Code pipeline end to end.

This is a native Claude Code port of the pipeline originally built
for GitHub Copilot Chat under `.github/` (see
`AGENTIC-SDLC-IMPLEMENTATION.md` for that version, and
`CLAUDE-CODE-MIGRATION-CONTEXT.md` for the porting rationale). The
pipeline's *behavior* is unchanged; what changed is the *mechanism*
— everywhere Claude Code has a real, native feature for something
Copilot had to fake with documentation conventions, this port uses
the real feature.

---

## 1. The Big Idea

This repo turns Claude Code into a **10-stage Agentic SDLC
pipeline** that takes a Jira story (`KAN-{{NUMBER}}`) all the way
from requirements to a published Confluence summary — spanning
**two repositories**:

- **App repo** (this repo) — Node.js/Express/TypeScript app, port 5050
- **Test repo** (`GITHUB_TEST_REPO_NAME`) — separate Playwright/Gherkin
  automation repo

Claude does the writing (docs, code, tests, PRs, review comments); a
human approves at every meaningful checkpoint. Nothing destructive
(merge, deploy, publish) happens without an explicit human action.

Stages 1b–3 (Requirements, Planning, Design) run as three
**subagents** under one **Documentation Agent** (`docs-agent`),
invoked via the real Task tool, writing local files to
`docs/{{STORY_ID}}/` with chat-based APPROVE/REJECT checkpoints.
Nothing is committed until Stage 4 (`developer-agent`), which
commits the whole `docs/{{STORY_ID}}/` bundle plus the code it
writes, and opens a single Dev PR covering both.

```
.claude/
├── agents/                        ← 11 real Claude Code subagents, invoked via the Task tool
│   ├── orchestrator-agent.md
│   ├── jira-agent.md
│   ├── docs-agent.md              ← Stage 1b-3 parent, calls 3 subagents below
│   ├── requirements-subagent.md   ← called only by docs-agent
│   ├── planner-subagent.md        ← called only by docs-agent
│   ├── design-subagent.md         ← called only by docs-agent
│   ├── developer-agent.md
│   ├── reviewer-agent.md
│   ├── deploy-agent.md
│   ├── tester-agent.md
│   └── confluence-agent.md
├── skills/                        ← 7 real Agent Skills, one folder each
│   ├── jira-reader/SKILL.md
│   ├── file-writer/SKILL.md
│   ├── git-committer/SKILL.md
│   ├── pr-creator/SKILL.md
│   ├── pr-commenter/SKILL.md
│   ├── confluence-publisher/SKILL.md
│   └── test-results-recorder/SKILL.md
├── templates/                     ← exact output shape per doc type
│   ├── requirements-template.md
│   ├── impl-plan-template.md
│   └── design-template.md
├── commands/                      ← slash-command pipeline entry points
│   ├── run-pipeline.md            ← /run-pipeline [KAN-{{NUMBER}}]
│   └── resume-pipeline.md         ← /resume-pipeline KAN-{{NUMBER}}
├── hooks/                         ← real executable hook scripts
│   ├── check-prereqs.js           ← PreToolUse (on_start replacement)
│   └── log-pipeline-stage.js      ← PostToolUse (on_complete replacement)
├── rules/
│   └── pipeline-rules.md          ← shared numbered guardrails (also folded into CLAUDE.md)
├── config/
│   └── pipeline-config.md         ← single source of truth for formats/rules
└── settings.json                  ← wires the two hook scripts to real tool-use events
```

Supporting files at repo root:
- `CLAUDE.md` — the always-on global rule file (folder structure,
  coding standards, security rules, all 7 pipeline rules folded in)
- `.env.example` — every environment variable the pipeline needs
  (Jira, Confluence, GitHub), safe to commit (no real secrets)
- `docs/{{STORY_ID}}/` — per-story folder where each story's
  generated pipeline documents land (`requirements-{{STORY_ID}}.md`,
  `impl-plan-{{STORY_ID}}.md`, `design-{{STORY_ID}}.md`,
  `pipeline-log.md`, `resume-context.md`)
- `CHANGELOG.md` — updated by the final stage

---

## 2. How Agents Work in Claude Code

Every file in `.claude/agents/*.md` is a real Claude Code **subagent**
— YAML frontmatter (`name`, `description`, `tools`, `model`) that
makes it independently invokable via the **Task tool**, either by the
main session or by another subagent (e.g. `orchestrator-agent` and
`docs-agent` both delegate to other subagents this way). This is a
structural difference from the Copilot version: Claude Code has no
folder-level "internal only" distinction the way `.github/agents/` vs
`.github/subagents/` did — every file here is reachable. The three
former subagents (`requirements-subagent`, `planner-subagent`,
`design-subagent`) signal "normally only called by `docs-agent`" via
naming and their `description` field, not folder placement.

`CLAUDE.md` is the always-on global rule file Claude applies
regardless of which subagent is active (folder structure, coding
standards, security rules, "never invent data beyond books/members/
loans", all 7 pipeline rules).

---

## 3. The Orchestrator Agent

**File:** `.claude/agents/orchestrator-agent.md`

The master controller. Given a story ID (or nothing, to browse the
backlog), it walks the human through all 10 stages, delegating each
stage to the matching specialist subagent **via the Task tool** and
enforcing checkpoints between them. Reachable directly through the
`/run-pipeline` slash command.

### Pipeline flow

| Stage | Name | Subagent | Output |
|---|---|---|---|
| 1a | Jira Lookup | jira-agent | story ID + fetched Jira details |
| 1b-3 | Documentation | docs-agent → requirements-subagent | `docs/{{STORY_ID}}/requirements-{{STORY_ID}}.md` (local, uncommitted) — **chat checkpoint** |
| 1b-3 | Documentation | docs-agent → planner-subagent | `docs/{{STORY_ID}}/impl-plan-{{STORY_ID}}.md` (local, uncommitted) — **chat checkpoint** |
| 1b-3 | Documentation | docs-agent → design-subagent | `docs/{{STORY_ID}}/design-{{STORY_ID}}.md` (local, uncommitted) — **chat checkpoint** |
| 4 | Development | developer-agent | commits `docs/{{STORY_ID}}/` bundle + `src/` code, single Dev PR (app repo) |
| 5 | Code Review | reviewer-agent | PR comments (Issue/Suggestion) — **checkpoint before posting** |
| 6 | Merge | reviewer-agent | Handoff Summary — **checkpoint: human merges PR** |
| 7 | Deploy | deploy-agent | app running at `localhost:5050` — **checkpoint** |
| 8 | Test Generation | tester-agent | PR (test repo) — **checkpoint on scope** |
| 9 | Test Execution | tester-agent | evidence log — **checkpoint: human reports results** |
| 10 | Documentation | confluence-agent | Confluence Batch Summary page |

### Context handoff between stages
Each stage's output becomes the next stage's input — passed
explicitly in each Task tool invocation, since a called subagent
cannot see the calling session's conversation history. This is
documented explicitly in the orchestrator so no stage has to guess
what upstream produced.

### Failure handling
On a stage failure: show the stage name + cause, ask the human to
retry or skip (only Planner Subagent, Design Subagent, and Stage 9
are skippable — Stage 1a, Requirements Subagent, Stage 4, Stage 8
never are), then re-run just that stage rather than restarting the
pipeline.

---

## 4. The Stage Agents

### Stage 1a — Jira Agent
The pipeline's entry point for anything Jira-related, and the **only**
agent that talks to the Jira REST API. If given no story ID, browses
the `KAN` backlog (all stories not Done, grouped by Epic) and asks the
human to pick one. If given a story ID directly, fetches that story's
full details (summary, description, acceptance criteria, story
points, status, assignee). Purely read-only — writes no files, makes
no commits. Hands the confirmed story ID + details off to `docs-agent`.
**No human checkpoint** beyond picking a story from the list. Uses
`jira-reader` only.

### Stage 1b-3 — Documentation Agent (+ 3 subagents)
`docs-agent.md` is a thin parent that invokes three subagents in
sequence via the Task tool. None of them commit or open a PR — they
only write local files to `docs/{{STORY_ID}}/`. Each has its own
chat-based APPROVE/REJECT checkpoint before the next one runs.

- **Requirements Subagent** — takes the story handed off by
  `jira-agent`, asks 5 fixed clarifying questions (constraints,
  dependencies, definition of done, NFRs, out-of-scope), writes
  `docs/{{STORY_ID}}/requirements-{{STORY_ID}}.md`. No longer talks
  to Jira itself.
- **Planner Subagent** — reads the requirements file, breaks the
  story into a dependency-ordered task list with LOW/MEDIUM/HIGH
  complexity per task, writes
  `docs/{{STORY_ID}}/impl-plan-{{STORY_ID}}.md`.
- **Design Subagent** — reads requirements + plan, produces one
  design doc covering Architecture (with a Mermaid/ASCII diagram),
  HLD, LLD (exact schema/API/validation), and one ASCII wireframe
  per screen — plus a **self-review** pass that assigns
  HIGH/MEDIUM/LOW severity to its own findings and an overall
  APPROVED/NEEDS CHANGES verdict. Constrained to the app's real
  schema (`books`, `members`, `loans` only). Writes
  `docs/{{STORY_ID}}/design-{{STORY_ID}}.md`.

Once all three are approved, `docs-agent` hands the full
`docs/{{STORY_ID}}/` bundle to `developer-agent`. Uses `file-writer`
only (no `git-committer`, no `pr-creator` — those come later).

A real `PreToolUse` hook (`check-prereqs.js`) enforces the
dependency order mechanically: writing `impl-plan-{{STORY_ID}}.md`
is blocked unless `requirements-{{STORY_ID}}.md` already exists;
writing `design-{{STORY_ID}}.md` is blocked unless both prior files
exist. See §5b.

### Stage 4 — Developer Agent
The first agent in the pipeline to actually touch git. Commits the
full `docs/{{STORY_ID}}/` bundle from `docs-agent` as its first
commit, then implements the approved design directly in this Claude
Code session, task by task in dependency order, committing after
each task. Enforces: error handling in every function, secrets only
from env vars, no invented data. Opens **one** Dev PR covering both
docs and code, with Summary / Changes Made / Known Limitations /
Reviewer Checklist. **No checkpoint** — flows straight to review.

### Stage 5–6 — Reviewer Agent
**Stage 5:** Reviews the Dev PR diff against the design doc across 7
areas (Correctness, Scope Discipline, Error Handling, Consistency,
Security, Regression Risk, Test Coverage Gaps), shows findings to the
human, and only posts them as GitHub PR comments after explicit
confirmation — nothing is ever auto-posted.
**Stage 6:** After the human merges the PR manually and confirms it,
produces a Handoff Summary for Testing (story ID, PR link, files
changed, what to test).

### Stage 7 — Deploy Agent
The lightest agent — no skills beyond the log write, just instructs
the human through pulling `main`, building, and running the app
locally at `localhost:5050`, then waits for confirmation. Purely a
manual-step gate so later automated tests have something real to hit.

### Stage 8–9 — Tester Agent
**Stage 8:** Confirms test scope with the human, then generates
Gherkin feature files + Playwright/TypeScript step definitions/page
objects/locators/test data in the **separate test repo**, following
that repo's existing conventions (`LibraryBasePage`, `bddTest.ts` +
`createBdd()`, `DataLoader`). Prefers real selectors read from this
app's `public/index.html` / `src/client/app.ts` / `src/routes/*.ts`
over placeholders. Builds a **requirement-to-scenario traceability
list** before writing any test code, shown at the scope-confirm
checkpoint. Opens a Test PR.
**Stage 9:** Does **not** execute tests itself — waits for the human
to run them locally and report "TESTING COMPLETE. Results: X passed,
Y failed", then records an evidence log via `test-results-recorder`.

### Stage 10 — Confluence Agent
Consolidates everything (requirements, design, PR links, review
findings, QA results, deploy confirmation) into one Confluence
**Batch Summary** page in space `AISDLC`, creating or updating as
needed, and updates `CHANGELOG.md`. Rule: never invent facts — mark
genuinely missing info `[pending]` instead of blocking. **Checkpoint**
before publishing. End of pipeline.

---

## 5. The 7 Skills

Skills are the reusable, low-level "verbs" agents call — each is a
real **Agent Skill** (`.claude/skills/<name>/SKILL.md` with YAML
frontmatter) containing required env vars, pre-flight checks, steps,
output shape, and explicit error-handling messages. This separation
means an agent's `.md` stays focused on *when/why* to act, while the
skill defines *how*.

| Skill | Purpose | Used by |
|---|---|---|
| `jira-reader/SKILL.md` | Fetch one story or query the backlog (read-only) via Jira REST API | jira-agent |
| `file-writer/SKILL.md` | Safely write/update repo files (blocks path traversal, blocks `.env` writes) | requirements-subagent, planner-subagent, design-subagent, developer-agent |
| `git-committer/SKILL.md` | Branch, stage, commit, push to app or test repo; strips `.env` if accidentally staged | developer-agent, tester-agent, confluence-agent (subagents never commit) |
| `pr-creator/SKILL.md` | Open a PR via GitHub REST API in app or test repo with required body sections | developer-agent, tester-agent (subagents never open a PR) |
| `pr-commenter/SKILL.md` | Post confirmed review findings as PR comments — never posts without human confirmation | reviewer-agent |
| `confluence-publisher/SKILL.md` | Create/update the Confluence Batch Summary page via REST API | confluence-agent |
| `test-results-recorder/SKILL.md` | Write a human-reported pass/fail evidence log (never fabricates results) | tester-agent |

### Common safety patterns across every skill
- Every skill lists **required env vars** and runs **pre-flight
  checks** before doing anything (missing token → clear error, not a
  silent failure)
- `.env` can never be written to or committed — enforced in both
  `file-writer` and `git-committer`
- Nothing that posts/publishes externally (`pr-commenter`,
  `confluence-publisher`) proceeds without explicit human confirmation
- Every skill defines exact error messages for its failure modes
  (401, 404, 422, missing branch, etc.) so agents never guess at
  troubleshooting

---

## 5b. Hooks — Real, Executable

**Files:** `.claude/settings.json` (wires events to scripts) +
`.claude/hooks/check-prereqs.js` + `.claude/hooks/log-pipeline-stage.js`

This is the part of the port that most benefits from Claude Code's
native features. The Copilot version's `pipeline-hooks.md` was
prose every agent had to remember to follow. Here, two real hooks
fire automatically on actual tool-use events:

- **`check-prereqs.js`** (`PreToolUse`, matcher: `Write`) — the
  on_start replacement. Before a `Write` tool call lands on
  `docs/{{STORY_ID}}/impl-plan-{{STORY_ID}}.md` or
  `docs/{{STORY_ID}}/design-{{STORY_ID}}.md`, it checks the
  prerequisite file(s) exist on disk and **blocks the write**
  (exit code 2) with a clear message if not — mechanically enforced,
  not something the model has to remember.
- **`log-pipeline-stage.js`** (`PostToolUse`, matcher: `Write`) — the
  on_complete replacement. After `requirements-subagent`,
  `planner-subagent`, or `design-subagent` write their output file,
  it automatically appends a row to `docs/{{STORY_ID}}/pipeline-log.md`
  (creating the file with its header if needed) and **overwrites**
  `docs/{{STORY_ID}}/resume-context.md` with the current story,
  last-completed stage, every artifact produced so far, and the exact
  next agent to invoke — without the agent needing to call
  `file-writer` for logging itself.

**Known limitation:** these hooks only fire on matching `Write` tool
calls, so they fully automate on_start/on_complete for the three
documentation subagents (the stages with a deterministic 1:1
file-to-stage mapping). Stages whose checkpoint is chat-only with no
matching file write (`deploy-agent`'s "deployed" confirmation,
`reviewer-agent`'s Stage 5/6 results, `tester-agent`'s Stage 8/9
results, `confluence-agent`'s publish) still have their agent
explicitly write to `pipeline-log.md` via the `file-writer` skill, as
described in each agent's own `## Hooks` section — there is no tool
event a hook could key off for a purely conversational confirmation.

---

## 5c. Rules

**File:** `.claude/rules/pipeline-rules.md` (same content also folded
into `CLAUDE.md`) — a shared, numbered rule set every agent's own
`## Rules` section points to instead of repeating guardrails inline:

1. **Jira — read-only, no exceptions.** Only `jira-agent` talks to
   Jira, and only via GET (browse backlog, fetch one story). No
   agent may create/update/transition/delete a Jira issue, ever.
2. **GitHub — scoped write access.** Only `git-committer`/
   `pr-creator`/`pr-commenter` write to GitHub; no agent merges a
   PR (always manual); no direct pushes to `main`.
3. **Confluence — single page, scoped space.** Only `confluence-agent`
   publishes, only the one Batch Summary page in `AISDLC`.
4. **Data integrity — never invent.** Every fact traces to a real
   source; missing info is marked `[pending]`, never guessed.
5. **Security.** No hardcoded credentials; `.env` is never
   touched by any skill.
6. **Checkpoints.** Never skip silently; nothing publishes
   externally without the human seeing it first.
7. **Scope discipline.** Each stage only touches the files it
   owns; a rejected checkpoint routes back to that stage, not a
   full pipeline restart.

`CLAUDE.md` stays the always-on global file (folder structure,
coding standards, plus these 7 rules folded in);
`.claude/rules/pipeline-rules.md` is kept as a standalone file too
so agents can point at it directly.

---

## 6. Pipeline Configuration

**File:** `.claude/config/pipeline-config.md` — the single source of
truth every agent and skill reads from, so formats stay consistent
without being hardcoded per agent:

- **Repos:** app repo (`GITHUB_REPO_NAME`) vs. test repo
  (`GITHUB_TEST_REPO_NAME`); app runs at `localhost:5050`
- **Jira:** project key `KAN`, story format `KAN-{{NUMBER}}`, fields
  to extract, minimum 3 clarifying questions
- **Branch naming:** `feature/claude-KAN-{{N}}-{{desc}}` (app) vs.
  `feature/tests-KAN-{{N}}` (test)
- **Commit format:** `[KAN-{{N}}] {{description}}`, imperative,
  <72 chars
- **PR conventions:** Requirements/Planner/Design subagents never
  open a PR (local files only); Dev PR needs Summary/Changes Made
  (docs bundle + code)/Known Limitations/Reviewer Checklist; Test PR
  needs Summary/Scenarios Covered/Files Changed
- **Code review checklist:** the 7 review areas, Issue vs. Suggestion
  tagging
- **Confluence page config:** space `AISDLC`, title format, the 7
  Batch Summary sections in order
- **Stage rules:** 10-minute timeout per stage, 1 retry on API
  failure, Stage 1a / Requirements Subagent / Stage 4 / Stage 8 can
  never be skipped
- **Output location:** per-story folder `docs/{{STORY_ID}}/` with
  story-suffixed filenames (`requirements-{{STORY_ID}}.md`,
  `impl-plan-{{STORY_ID}}.md`, `design-{{STORY_ID}}.md`,
  `pipeline-log.md`, `resume-context.md`)
- **App domain constraint:** tables are only `books`, `members`,
  `loans` — repeated everywhere so no agent invents schema

---

## 7. Environment Variables (`.env.example`)

Three credential groups, all optional-until-needed per stage:

- **Jira:** `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`,
  `JIRA_PROJECT_KEY`
- **Confluence:** `CONFLUENCE_URL`, `CONFLUENCE_API_TOKEN`,
  `CONFLUENCE_SPACE_KEY`, `CONFLUENCE_PARENT_PAGE_ID` (optional)
- **GitHub:** `GITHUB_TOKEN` (needs `repo`, `pull_requests`,
  `contents` scopes), `GITHUB_REPO_NAME`, `GITHUB_TEST_REPO_NAME`,
  `GITHUB_DEFAULT_BRANCH`, `GITHUB_BRANCH_PREFIX`

`.env.example` should be committed (placeholder values only); the
real `.env` must stay git-ignored and is never touched by any skill.

---

## 8. Human Checkpoints — Full List

These are the moments the pipeline stops and waits, in order:

1. **After Requirements Subagent** — chat-based APPROVE/REJECT
   (no PR — local file only)
2. **After Planner Subagent** — chat-based APPROVE/REJECT of the
   impl plan (no PR — local file only)
3. **After Design Subagent** — chat-based APPROVE/REJECT of the
   design doc (no PR — local file only)
4. **Before posting Stage 5 review comments** — confirm findings
5. **After Stage 6** — human merges the Dev PR manually and confirms
6. **After Stage 7** — human confirms the app is deployed locally
7. **Before Stage 8** — human confirms test scope
8. **After Stage 9** — human reports actual pass/fail counts
9. **Before Stage 10 publish** — confirm content before it goes to
   Confluence

Stage 4 (Development) runs without a checkpoint (auto-flow), by
design — code produced there is reviewed downstream at Stage 5 anyway.
Stage 1a (Jira Lookup) also has no approval gate — only a choice from
the backlog list, since nothing is written or committed at that step.

---

## 9. Demo Script Suggestion

1. Show `.claude/agents/` — 11 flat `.md` files, each a real
   subagent (contrast with Copilot's picker-driven `agents/` +
   `subagents/` split)
2. Run `/run-pipeline KAN-1` (or `/run-pipeline` with no argument to
   show backlog browsing grouped by Epic) — this invokes
   `orchestrator-agent` directly, an explicit entry point Copilot's
   agent-picker workflow didn't have
3. Show the handoff from `jira-agent` (Stage 1a, fetched story
   details) into `docs-agent` (Stage 1b-3), which invokes
   `requirements-subagent` via the Task tool first — pause at its
   chat checkpoint (`docs/KAN-1/requirements-KAN-1.md` written
   locally, no PR, APPROVE/REJECT), then `planner-subagent` — pause
   again at its chat checkpoint (`docs/KAN-1/impl-plan-KAN-1.md`)
4. **Show the real hook in action:** try (or narrate) what happens
   if `design-subagent`'s write were attempted before
   `impl-plan-KAN-1.md` existed — `check-prereqs.js` blocks it
   mechanically, no model judgment involved
5. Continue to `design-subagent`, highlight the **self-review**
   section and severity tags, pause at its chat checkpoint
   (`docs/KAN-1/design-KAN-1.md`) — then open
   `docs/KAN-1/pipeline-log.md` and `docs/KAN-1/resume-context.md`
   and show both were written automatically by `log-pipeline-stage.js`,
   with no agent action required
6. Continue to Stage 4 (Development) — show `developer-agent`'s
   first commit bundling the whole `docs/KAN-1/` folder, then code
   landing in `src/` with commits per task, then the single Dev PR
   covering both
7. Stage 5 — show the reviewer findings list *before* it posts
   anything, to demonstrate the confirm-before-post safety rule
8. Stage 7 — show the pure manual-gate agent (no skills) as a contrast
   to the automated ones
9. Stage 10 — show the Confluence Batch Summary page and the
   `CHANGELOG.md` update
10. **Crash recovery** — open `docs/KAN-1/resume-context.md`, show
    it's been kept up to date after every approved stage (not just
    the last one), then simulate a dead session: open a **brand-new**
    Claude Code session and run `/resume-pipeline KAN-1` — show it
    picks the pipeline back up at the correct next agent with zero
    re-explanation
11. Close by pointing at `.claude/config/pipeline-config.md` as the
    single config source every stage/skill reads from, and
    `.env.example` as the credential contract — then contrast the
    whole `.claude/` tree against `.github/` one more time to land
    the "real mechanism vs. documentation convention" point
