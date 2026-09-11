# Context Prompt — Port Agentic SDLC Pipeline to Claude Code

Paste this whole file into a fresh Claude Code session in the **new** repository (a copy of this app's code) to bootstrap the port. It is self-contained — no prior conversation needed.

---

## What This Is

The source repo (`library-management-app-copilot-capstone`) implements a 10-stage Agentic SDLC pipeline for GitHub Copilot Chat: a Jira story (`KAN-{{NUMBER}}`) flows through Requirements → Planning → Design → Development → Review → Merge → Deploy → Test Generation → Test Execution → Confluence documentation, spanning this app repo (Node.js/ Express/TypeScript, port 5050) and a separate Playwright/Gherkin test repo. A human approves at every meaningful checkpoint.

**The goal here:** reimplement the same pipeline natively in **Claude Code**, in this new repo, using `.claude/` instead of `.github/` — not a copy-paste, but a re-architecture using Claude Code's real features (subagents, Agent Skills, executable hooks) instead of the documentation-only conventions the Copilot version had to invent.

---

## Source Architecture (what to replicate, behaviorally)

### Pipeline stages

1.  **Jira Agent** (Stage 1a) — read-only Jira REST access. Browses the `KAN` backlog (filtered to `issuetype=Story`) or fetches one story in full. Hands off story ID + details. No files written.
2.  **Documentation Agent** (Stage 1b-3) — parent that calls 3 narrower helpers in sequence, each with its own chat-based APPROVE/REJECT checkpoint, each writing a **local, uncommitted** file:
    -   **Requirements** — 5 fixed clarifying questions asked together in one message, writes `docs/{{STORY_ID}}/requirements-{{STORY_ID}}.md`
    -   **Planner** — dependency-ordered task list with LOW/MEDIUM/HIGH complexity, writes `docs/{{STORY_ID}}/impl-plan-{{STORY_ID}}.md`
    -   **Design** — Architecture/HLD/LLD/Wireframes + a self-review pass (severity-tagged findings, APPROVED/NEEDS CHANGES verdict), writes `docs/{{STORY_ID}}/design-{{STORY_ID}}.md`
    -   None of these three commit or open a PR. That's deliberate — no PR review overhead before any code exists.
3.  **Developer Agent** (Stage 4) — the FIRST agent to touch git. Commits the whole `docs/{{STORY_ID}}/` bundle as its first commit, then implements code task-by-task, committing after each. Opens **one** Dev PR covering docs + code together. No checkpoint (reviewed downstream instead).
4.  **Reviewer Agent** (Stage 5-6) — reviews the Dev PR diff across 7 areas (Correctness, Scope Discipline, Error Handling, Consistency, Security, Regression Risk, Test Coverage Gaps), shows findings in-chat, only posts as PR comments after explicit human confirmation. After human merges manually, produces a Handoff Summary for Testing.
5.  **Deploy Agent** (Stage 7) — pure manual-gate: instructs human to pull/build/run locally, waits for confirmation the app is live.
6.  **Tester Agent** (Stage 8-9) — before writing any test code, builds a **requirement-to-scenario traceability list** (every Functional Requirement/Acceptance Criteria mapped to the scenario that covers it, gaps called out explicitly) and shows it at the scope-confirm checkpoint. Then generates Gherkin + Playwright/TS in the **separate test repo**, opens a Test PR. Does NOT execute tests — waits for the human to run them and report pass/fail, then records an evidence log.
7.  **Confluence Agent** (Stage 10) — consolidates everything into one Confluence Batch Summary page (space `AISDLC`), updates `CHANGELOG.md`. Never invents facts — marks missing info `[pending]`.

### Cross-cutting behaviors (must carry over)

-   **Jira is READ-ONLY, no exceptions** — only the Jira-access agent ever calls the Jira API, GET-only, never create/update/delete an issue. This was an explicit, hard requirement.
-   **Per-story docs folder**: `docs/{{STORY_ID}}/` with story-suffixed filenames (`requirements-{{STORY_ID}}.md`, not `requirements.md`) — collision-proof if multiple stories are in flight.
-   **Templates**: each doc type has an exact section structure + one worked example (based on a real story), referenced by the agent that produces it, not duplicated inline.
-   **Audit log**: `docs/{{STORY_ID}}/pipeline-log.md` — one markdown table row per stage (timestamp, stage, output, checkpoint result), batched to one write per top-level agent, not per internal stage.
-   **Crash recovery**: `docs/{{STORY_ID}}/resume-context.md` — overwritten (not appended) after every stage, always reflecting the last approved stage + every artifact produced so far + exactly which agent to select next. Designed to be pasted into a brand-new session after a token-limit/network/crash failure with zero re-explanation.
-   **REJECT = targeted diff, not full redo** — on any checkpoint rejection, fix only the specific thing called out, never regenerate a whole document/review from scratch.
-   **Never invent data** — every fact traces to a real source (API response, file read, human answer); genuinely missing info is marked `[pending]`, never guessed. App schema constraint: tables are only `books`, `members`, `loans`.
-   **Security**: no hardcoded credentials, env vars only, `.env` never read/written/committed by any tool.

---

## Folder/File Mapping: `.github/` → `.claude/`

Old (Copilot)

New (Claude Code)

What changes

`copilot-instructions.md`

`CLAUDE.md` (repo root)

Direct equivalent, always-loaded

`agents/*.agent.md`

`agents/*.md`

Real Claude Code subagents (YAML frontmatter: `name`, `description`, `tools`, `model`)

`subagents/*.agent.md`

**merge into `agents/*.md`**

Claude Code has no folder-level "internal only" distinction — every file in `.claude/agents/` is independently invokable via the Task tool. Signal "normally only called by Documentation Agent" via the `description` field and docs, not folder structure

`skills/*.md` (flat files)

`skills/<skill-name>/SKILL.md` (one folder per skill)

Real Agent Skills format — this is a structural change, not just a rename. Each skill folder can also hold supporting scripts

`hooks/pipeline-hooks.md` (prose)

`settings.json` → `"hooks"` key

**Real, executable hooks** — actual shell commands on real events (`PreToolUse`, `PostToolUse`, `Stop`, etc.), not an instruction the model has to remember. The on_start file-check and on_complete log-append logic should become real scripts here, not markdown prose

`rules/pipeline-rules.md`

fold into `CLAUDE.md`, or keep as `.claude/rules/pipeline-rules.md` referenced from `CLAUDE.md`

No dedicated "rules" folder convention in Claude Code — either works, folding into CLAUDE.md is more idiomatic

`templates/*.md`

`templates/*.md`

No change — no special convention either way

`config/pipeline-config.md`

`config/pipeline-config.md` (or fold into CLAUDE.md)

No change — no special convention either way

(none)

`commands/*.md`

NEW — add slash commands, e.g. `/run-pipeline KAN-{{N}}` as an explicit entry point instead of "select Orchestrator from a picker"

(none)

`.mcp.json`

NEW — if/when Jira/Confluence/GitHub move to real MCP servers instead of prose-described REST calls, this is where they're configured

---

## What To Do, Step by Step

1.  Set up `CLAUDE.md` at repo root — port `copilot-instructions.md`'s content (folder structure, coding standards, security rules, Jira-read-only callout) plus fold in `pipeline-rules.md`'s 7 rules
2.  Create `.claude/agents/` with one `.md` per stage — orchestrator, jira, documentation (+ its 3 former subagents as their own files, called via Task tool), developer, reviewer, deploy, tester, confluence. Use real Claude Code subagent frontmatter (`tools:`, `model:`) instead of the free-text `model: Claude Sonnet 5` line the Copilot version used
3.  Create `.claude/skills/` — one folder per skill (`jira-reader/`, `file-writer/`, `git-committer/`, `pr-creator/`, `pr-commenter/`, `confluence-publisher/`, `test-results-recorder/`), each with a `SKILL.md`
4.  Create `.claude/templates/` — port the 3 templates + worked examples as-is
5.  Design real hooks in `.claude/settings.json` for the on_start (verify input files exist) / on_complete (append to `pipeline-log.md`, overwrite `resume-context.md`) behavior — this is the part that most benefits from being real automation instead of prose
6.  Add `.claude/commands/` for explicit pipeline entry points
7.  Keep the same `docs/{{STORY_ID}}/` per-story folder convention, same file naming, same traceability-list step in the tester agent, same targeted-diff REJECT behavior everywhere

---

## Why This Port Matters (context for why you're doing it)

This is meant to demonstrate Claude Code working **independently** — showing off Claude Code's own native features (real subagents, real executable hooks, real Agent Skills, slash commands, MCP) doing the same job the Copilot version did with hand-written prose conventions, not a like-for-like copy. Where Claude Code has a real mechanism for something the Copilot version had to fake with documentation (hooks, subagent invocation), use the real mechanism.