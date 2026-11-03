---
name: ship
preamble-tier: 4
version: 1.0.0
description: |
  Ship workflow: detect + merge base branch, run tests, review diff, bump VERSION, update CHANGELOG, commit, push, create PR. Use when asked to "ship", "deploy", "push to main", "create a PR", or "merge and push".
  Proactively suggest when the user says code is ready or asks about deploying.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Agent
  - AskUserQuestion
  - WebSearch
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bash scripts/gen-skill-docs.sh -->

## Preamble (run first)

```bash
_GSTACK_BIN="${CLAUDE_SKILL_DIR}/../../bin"
[ -x "$_GSTACK_BIN/gstack-config" ] || { _P=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/bin/gstack-config" -type f 2>/dev/null | head -1); _GSTACK_BIN=${_P%/gstack-config}; }
echo "GSTACK_BIN: ${_GSTACK_BIN:-NOT_FOUND}"
echo "BRANCH: $(git branch --show-current 2>/dev/null || echo unknown)"
```

Each Bash call is a fresh shell: in any later command that uses `$_GSTACK_BIN`, first set `_GSTACK_BIN=<GSTACK_BIN printed above>` in that same command.

## AskUserQuestion Format

Every AskUserQuestion call:
1. **Re-ground** — project, current branch (`BRANCH` from the preamble, not from conversation history), current task. 1-2 sentences.
2. **Plain language** — no internal jargon or raw function names; assume the user does not have the code open.
3. **Recommend** — `RECOMMENDATION: Choose [X] because [reason]`, plus `Completeness: X/10` per option (10 = all edge cases, 7 = happy path only, 3 = shortcut that defers real work). If the complete option costs only a little more, recommend it.
4. **Options** — lettered `A) ... B) ...`; when effort matters show `(human: ~X / CC: ~Y)`.
5. **One decision per question.** Several questions in a row are fine; a final Approve/Revise/Reject gate comes only after the individual decisions.

## Completion Status Protocol

Finish with one status: **DONE** (every claim backed by evidence) · **DONE_WITH_CONCERNS** (list each concern) · **BLOCKED** (what blocks, what was tried) · **NEEDS_CONTEXT** (exactly what is missing).

Stop and escalate after 3 failed attempts at the same step, on security-sensitive changes you are unsure of, or when the scope exceeds what you can verify:
```
STATUS: BLOCKED | NEEDS_CONTEXT
REASON: [1-2 sentences]
ATTEMPTED: [what you tried]
RECOMMENDATION: [what the user should do next]
```

## Step 0: Detect base branch

Determine which branch this PR targets. Use the result as "the base branch" in all subsequent steps.

1. Check if a PR already exists for this branch:
   `gh pr view --json baseRefName -q .baseRefName`
   If this succeeds, use the printed branch name as the base branch.

2. If no PR exists (command fails), detect the repo's default branch:
   `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`

3. If both commands fail, fall back to `main`.

Print the detected base branch name. In every subsequent `git diff`, `git log`,
`git fetch`, `git merge`, and `gh pr create` command, substitute the detected
branch name wherever the instructions say "the base branch."

---

# Ship: Fully Automated Ship Workflow

You are running the `/ship` workflow. This is a **non-interactive, fully automated** workflow. Do NOT ask for confirmation at any step. The user said `/ship` which means DO IT. Run straight through and output the PR URL at the end.

**Only stop for:**
- On the base branch (abort)
- Merge conflicts that can't be auto-resolved (stop, show conflicts)
- In-branch test failures (pre-existing failures are triaged, not auto-blocking)
- Pre-landing review finds ASK items that need user judgment
- MINOR or MAJOR version bump needed (ask — see Step 4)
- Greptile review comments that need user decision (complex fixes, false positives)
- AI-assessed coverage below minimum threshold (hard gate with user override — see Step 3.4)
- Plan items NOT DONE with no user override (see Step 3.45)
- Plan verification failures (see Step 3.47)
- TODOS.md missing and user wants to create one (ask — see Step 5.5)
- TODOS.md disorganized and user wants to reorganize (ask — see Step 5.5)

**Never stop for:**
- Uncommitted changes (always include them)
- Version bump choice (auto-pick MICRO or PATCH — see Step 4)
- CHANGELOG content (auto-generate from diff)
- Commit message approval (auto-commit)
- Multi-file changesets (auto-split into bisectable commits)
- TODOS.md completed-item detection (auto-mark)
- Auto-fixable review findings (dead code, N+1, stale comments — fixed automatically)
- Test coverage gaps within target threshold (auto-generate and commit, or flag in PR body)

---

## Step 1: Pre-flight

1. Check the current branch. If on the base branch or the repo's default branch, **abort**: "You're on the base branch. Ship from a feature branch."

2. Run `git status` (never use `-uall`). Uncommitted changes are always included — no need to ask.

3. Run `git diff <base>...HEAD --stat` and `git log <base>..HEAD --oneline` to understand what's being shipped.

4. Check review readiness:

**[L2]** Build and show the Review Readiness Dashboard — Read `${CLAUDE_SKILL_DIR}/../_shared/REVIEW_DASHBOARD.md` and follow it.

If the Eng Review is NOT "CLEAR":

1. **Check for a prior override on this branch:**
   ```bash
   eval "$("$_GSTACK_BIN"/gstack-slug 2>/dev/null)"
   grep '"skill":"ship-review-override"' .crew/artifacts/review/$BRANCH-reviews.jsonl 2>/dev/null || echo "NO_OVERRIDE"
   ```
   If an override exists, display the dashboard and note "Review gate previously accepted — continuing." Do NOT ask again.

2. **If no override exists,** use AskUserQuestion:
   - Show that Eng Review is missing or has open issues
   - RECOMMENDATION: Choose C if the change is obviously trivial (< 20 lines, typo fix, config-only); Choose B for larger changes
   - Options: A) Ship anyway  B) Abort — run /review or /plan-eng-review first  C) Change is too small to need eng review
   - If CEO Review is missing, mention as informational ("CEO Review not run — recommended for product changes") but do NOT block
   - For Design Review: run `source <("$_GSTACK_BIN"/gstack-diff-scope <base> 2>/dev/null)`. If `SCOPE_FRONTEND=true` and no design review (plan-design-review or design-review-lite) exists in the dashboard, mention: "Design Review not run — this PR changes frontend code. The lite design check will run automatically in Step 3.5, but consider running /design-review for a full visual audit post-implementation." Still never block.

3. **If the user chooses A or C,** persist the decision so future `/ship` runs on this branch skip the gate:
   ```bash
   eval "$("$_GSTACK_BIN"/gstack-slug 2>/dev/null)"
   mkdir -p .crew/artifacts/review
   echo '{"skill":"ship-review-override","timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","decision":"USER_CHOICE"}' >> .crew/artifacts/review/$BRANCH-reviews.jsonl
   ```
   Substitute USER_CHOICE with "ship_anyway" or "not_relevant".

---

## Step 1.5: Distribution Pipeline Check

**[L2]** Only if the diff adds a new standalone artifact (CLI binary, library package, tool) rather than a deployed web service — Read `${CLAUDE_SKILL_DIR}/references/distribution-check.md` and follow it.

## Step 2: Merge the base branch (BEFORE tests)

Fetch and merge the base branch into the feature branch so tests run against the merged state:

```bash
git fetch origin <base> && git merge origin/<base> --no-edit
```

**If there are merge conflicts:** Try to auto-resolve if they are simple (VERSION, schema.rb, CHANGELOG ordering). If conflicts are complex or ambiguous, **STOP** and show them.

**If already up to date:** Continue silently.

---

## Step 2.5: Test Framework Bootstrap

**[L2]** Always run (it exits early when a test framework already exists or bootstrap was declined) — Read `${CLAUDE_SKILL_DIR}/../_shared/TEST_BOOTSTRAP.md` and follow it.

---

## Step 3: Run tests (on merged code)

Run the project's test suite(s): use the commands named in CLAUDE.md / `.crew/config.md`; otherwise detect them (`package.json` scripts, `Makefile`, `pytest`, `go test ./...`, `cargo test`). Tee output to `/tmp/ship_tests.txt` and read it to decide pass/fail.

**[L2]** If any test fails, do NOT stop immediately — Read `${CLAUDE_SKILL_DIR}/references/test-failure-triage.md` and follow it (classify in-branch vs pre-existing failures first).

## Step 3.25: Eval Suites (conditional)

**[L2]** Only if the diff touches prompt-related files; otherwise skip this step — Read `${CLAUDE_SKILL_DIR}/references/eval-suites.md` and follow it.

## Step 3.4: Test Coverage Audit

**[L2]** Always run — Read `${CLAUDE_SKILL_DIR}/references/test-coverage-audit.md` and follow it.

## Step 3.45: Plan Completion Audit

**[L2]** Always run — Read `${CLAUDE_SKILL_DIR}/references/plan-completion-audit.md` and follow it.

## Step 3.47: Plan Verification

**[L2]** Always run — Read `${CLAUDE_SKILL_DIR}/references/plan-verification.md` and follow it.

## Step 3.5: Pre-Landing Review

Review the diff for structural issues that tests don't catch.

1. Read `.claude/skills/review/checklist.md`. If the file cannot be read, **STOP** and report the error.

2. Run `git diff origin/<base>` to get the full diff (scoped to feature changes against the freshly-fetched base branch).

3. Apply the review checklist in two passes:
   - **Pass 1 (CRITICAL):** SQL & Data Safety, LLM Output Trust Boundary
   - **Pass 2 (INFORMATIONAL):** All remaining categories

## Design Review (conditional, diff-scoped)

Check if the diff touches frontend files using `gstack-diff-scope`:

```bash
source <("$_GSTACK_BIN"/gstack-diff-scope <base> 2>/dev/null)
```

**If `SCOPE_FRONTEND=false`:** Skip design review silently. No output.

**If `SCOPE_FRONTEND=true`:**

1. **Check for DESIGN.md.** If `DESIGN.md` or `design-system.md` exists in the repo root, read it. All design findings are calibrated against it — patterns blessed in DESIGN.md are not flagged. If not found, use universal design principles.

2. **Read `.claude/skills/review/design-checklist.md`.** If the file cannot be read, skip design review with a note: "Design checklist not found — skipping design review."

3. **Read each changed frontend file** (full file, not just diff hunks). Frontend files are identified by the patterns listed in the checklist.

4. **Apply the design checklist** against the changed files. For each item:
   - **[HIGH] mechanical CSS fix** (`outline: none`, `!important`, `font-size < 16px`): classify as AUTO-FIX
   - **[HIGH/MEDIUM] design judgment needed**: classify as ASK
   - **[LOW] intent-based detection**: present as "Possible — verify visually or run /design-review"

5. **Include findings** in the review output under a "Design Review" header, following the output format in the checklist. Design findings merge with code review findings into the same Fix-First flow.

6. **Log the result** for the Review Readiness Dashboard:

```bash
"$_GSTACK_BIN"/gstack-review-log '{"skill":"design-review-lite","timestamp":"TIMESTAMP","status":"STATUS","findings":N,"auto_fixed":M,"commit":"COMMIT"}'
```

Substitute: TIMESTAMP = ISO 8601 datetime, STATUS = "clean" if 0 findings or "issues_found", N = total findings, M = auto-fixed count, COMMIT = output of `git rev-parse --short HEAD`.

7. **Codex design voice** (optional, automatic if available):

```bash
which codex 2>/dev/null && echo "CODEX_AVAILABLE" || echo "CODEX_NOT_AVAILABLE"
```

If Codex is available, run a lightweight design check on the diff:

```bash
TMPERR_DRL=$(mktemp /tmp/codex-drl-XXXXXXXX)
codex exec "Review the git diff on this branch. Run 7 litmus checks (YES/NO each): 1. Brand/product unmistakable in first screen? 2. One strong visual anchor present? 3. Page understandable by scanning headlines only? 4. Each section has one job? 5. Are cards actually necessary? 6. Does motion improve hierarchy or atmosphere? 7. Would design feel premium with all decorative shadows removed? Flag any hard rejections: 1. Generic SaaS card grid as first impression 2. Beautiful image with weak brand 3. Strong headline with no clear action 4. Busy imagery behind text 5. Sections repeating same mood statement 6. Carousel with no narrative purpose 7. App UI made of stacked cards instead of layout 5 most important design findings only. Reference file:line." -s read-only -c 'model_reasoning_effort="high"' --enable web_search_cached 2>"$TMPERR_DRL"
```

Use a 5-minute timeout (`timeout: 300000`). After the command completes, read stderr:
```bash
cat "$TMPERR_DRL" && rm -f "$TMPERR_DRL"
```

**Error handling:** All errors are non-blocking. On auth failure, timeout, or empty response — skip with a brief note and continue.

Present Codex output under a `CODEX (design):` header, merged with the checklist findings above.

   Include any design findings alongside the code review findings. They follow the same Fix-First flow below.

4. **Classify each finding as AUTO-FIX or ASK** per the Fix-First Heuristic in
   checklist.md. Critical findings lean toward ASK; informational lean toward AUTO-FIX.

5. **Auto-fix all AUTO-FIX items.** Apply each fix. Output one line per fix:
   `[AUTO-FIXED] [file:line] Problem → what you did`

6. **If ASK items remain,** present them in ONE AskUserQuestion:
   - List each with number, severity, problem, recommended fix
   - Per-item options: A) Fix  B) Skip
   - Overall RECOMMENDATION
   - If 3 or fewer ASK items, you may use individual AskUserQuestion calls instead

7. **After all fixes (auto + user-approved):**
   - If ANY fixes were applied: commit fixed files by name (`git add <fixed-files> && git commit -m "fix: pre-landing review fixes"`), then **STOP** and tell the user to run `/ship` again to re-test.
   - If no fixes applied (all ASK items skipped, or no issues found): continue to Step 4.

8. Output summary: `Pre-Landing Review: N issues — M auto-fixed, K asked (J fixed, L skipped)`

   If no issues found: `Pre-Landing Review: No issues found.`

Save the review output — it goes into the PR body in Step 8.

---

## Step 3.75: Address Greptile review comments (if PR exists)

**[L2]** Only if a PR already exists (skip silently otherwise) — Read `${CLAUDE_SKILL_DIR}/references/greptile.md` and follow it.

## Step 3.8: Adversarial review (auto-scaled)

**[L2]** Always run (thoroughness scales with diff size) — Read `${CLAUDE_SKILL_DIR}/references/adversarial-review.md` and follow it.

## Step 4: Version bump (auto-decide)

1. Read the current `VERSION` file (4-digit format: `MAJOR.MINOR.PATCH.MICRO`)

2. **Auto-decide the bump level based on the diff:**
   - Count lines changed (`git diff origin/<base>...HEAD --stat | tail -1`)
   - **MICRO** (4th digit): < 50 lines changed, trivial tweaks, typos, config
   - **PATCH** (3rd digit): 50+ lines changed, bug fixes, small-medium features
   - **MINOR** (2nd digit): **ASK the user** — only for major features or significant architectural changes
   - **MAJOR** (1st digit): **ASK the user** — only for milestones or breaking changes

3. Compute the new version:
   - Bumping a digit resets all digits to its right to 0
   - Example: `0.19.1.0` + PATCH → `0.19.2.0`

4. Write the new version to the `VERSION` file.

---

## Step 5: CHANGELOG (auto-generate)

1. Read `CHANGELOG.md` header to know the format.

2. Auto-generate the entry from **ALL commits on the branch** (not just recent ones):
   - Use `git log <base>..HEAD --oneline` to see every commit being shipped
   - Use `git diff <base>...HEAD` to see the full diff against the base branch
   - The CHANGELOG entry must be comprehensive of ALL changes going into the PR
   - If existing CHANGELOG entries on the branch already cover some commits, replace them with one unified entry for the new version
   - Categorize changes into applicable sections:
     - `### Added` — new features
     - `### Changed` — changes to existing functionality
     - `### Fixed` — bug fixes
     - `### Removed` — removed features
   - Write concise, descriptive bullet points
   - Insert after the file header (line 5), dated today
   - Format: `## [X.Y.Z.W] - YYYY-MM-DD`

**Do NOT ask the user to describe changes.** Infer from the diff and commit history.

---

## Step 5.5: TODOS.md (auto-update)

**[L2]** Always run — Read `${CLAUDE_SKILL_DIR}/references/todos-update.md` and follow it.

## Step 6: Commit (bisectable chunks)

**Goal:** Create small, logical commits that work well with `git bisect` and help LLMs understand what changed.

1. Analyze the diff and group changes into logical commits. Each commit should represent **one coherent change** — not one file, but one logical unit.

2. **Commit ordering** (earlier commits first):
   - **Infrastructure:** migrations, config changes, route additions
   - **Models & services:** new models, services, concerns (with their tests)
   - **Controllers & views:** controllers, views, JS/React components (with their tests)
   - **VERSION + CHANGELOG + TODOS.md:** always in the final commit

3. **Rules for splitting:**
   - A model and its test file go in the same commit
   - A service and its test file go in the same commit
   - A controller, its views, and its test go in the same commit
   - Migrations are their own commit (or grouped with the model they support)
   - Config/route changes can group with the feature they enable
   - If the total diff is small (< 50 lines across < 4 files), a single commit is fine

4. **Each commit must be independently valid** — no broken imports, no references to code that doesn't exist yet. Order commits so dependencies come first.

5. Compose each commit message:
   - First line: `<type>: <summary>` (type = feat/fix/chore/refactor/docs)
   - Body: brief description of what this commit contains
   - Only the **final commit** (VERSION + CHANGELOG) gets the version tag and co-author trailer:

```bash
git commit -m "$(cat <<'EOF'
chore: bump version and changelog (vX.Y.Z.W)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

6. **Staging hygiene (required before every commit):**
   - Reset the index first so a prior partial staging cannot contaminate this commit: `git reset` (unstage everything).
   - Stage **only this commit's intended paths by name**: `git add <path> <path> …`. Do **not** use `git add -A` / `git add .` — leftover staging from earlier steps pollutes the first commit.
   - Verify the staged set matches intent before committing: `git diff --cached --name-only` and confirm it equals the intended path set for this commit. If it differs, unstage the strays and re-add.

---

## Step 6.5: Verification Gate

**IRON LAW: NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.**

Before pushing, re-verify if code changed during Steps 4-6:

1. **Test verification:** If ANY code changed after Step 3's test run (fixes from review findings, CHANGELOG edits don't count), re-run the test suite. Paste fresh output. Stale output from Step 3 is NOT acceptable.

2. **Build verification:** If the project has a build step, run it. Paste output.

3. **Rationalization prevention:**
   - "Should work now" → RUN IT.
   - "I'm confident" → Confidence is not evidence.
   - "I already tested earlier" → Code changed since then. Test again.
   - "It's a trivial change" → Trivial changes break production.

**If tests fail here:** STOP. Do not push. Fix the issue and return to Step 3.

Claiming work is complete without verification is dishonesty, not efficiency.

---

## Step 7: Push

Push to the remote with upstream tracking:

```bash
git push -u origin <branch-name>
```

---

## Step 8: Create PR

Create a pull request using `gh`:

```bash
gh pr create --base <base> --title "<type>: <summary>" --body "$(cat <<'EOF'
## Summary
<bullet points from CHANGELOG>

## Test Coverage
<coverage diagram from Step 3.4, or "All new code paths have test coverage.">
<If Step 3.4 ran: "Tests: {before} → {after} (+{delta} new)">

## Pre-Landing Review
<findings from Step 3.5 code review, or "No issues found.">

## Design Review
<If design review ran: "Design Review (lite): N findings — M auto-fixed, K skipped. AI Slop: clean/N issues.">
<If no frontend files changed: "No frontend files changed — design review skipped.">

## Eval Results
<If evals ran: suite names, pass/fail counts, cost dashboard summary. If skipped: "No prompt-related files changed — evals skipped.">

## Greptile Review
<If Greptile comments were found: bullet list with [FIXED] / [FALSE POSITIVE] / [ALREADY FIXED] tag + one-line summary per comment>
<If no Greptile comments found: "No Greptile comments.">
<If no PR existed during Step 3.75: omit this section entirely>

## Plan Completion
<If plan file found: completion checklist summary from Step 3.45>
<If no plan file: "No plan file detected.">
<If plan items deferred: list deferred items>

## Verification Results
<If verification ran: summary from Step 3.47 (N PASS, M FAIL, K SKIPPED)>
<If skipped: reason (no plan, no server, no verification section)>
<If not applicable: omit this section>

## TODOS
<If items marked complete: bullet list of completed items with version>
<If no items completed: "No TODO items completed in this PR.">
<If TODOS.md created or reorganized: note that>
<If TODOS.md doesn't exist and user skipped: omit this section>

## Test plan
- [x] All Rails tests pass (N runs, 0 failures)
- [x] All Vitest tests pass (N tests)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Output the PR URL** — then proceed to Step 8.5.

---

## Step 8.5: Auto-invoke /document-release

**[L2]** Always run after the PR is created — Read `${CLAUDE_SKILL_DIR}/references/document-release.md` and follow it.

## Step 8.75: Persist ship metrics

**[L2]** Always run after the PR is created — Read `${CLAUDE_SKILL_DIR}/references/ship-metrics.md` and follow it.

## Important Rules

- **Never skip tests.** If tests fail, stop.
- **Never skip the pre-landing review.** If checklist.md is unreadable, stop.
- **Never force push.** Use regular `git push` only.
- **Never ask for trivial confirmations** (e.g., "ready to push?", "create PR?"). DO stop for: version bumps (MINOR/MAJOR), pre-landing review findings (ASK items), and Codex structured review [P1] findings (large diffs only).
- **Always use the 4-digit version format** from the VERSION file.
- **Date format in CHANGELOG:** `YYYY-MM-DD`
- **Split commits for bisectability** — each commit = one logical change.
- **TODOS.md completion detection must be conservative.** Only mark items as completed when the diff clearly shows the work is done.
- **Use Greptile reply templates from greptile-triage.md.** Every reply includes evidence (inline diff, code references, re-rank suggestion). Never post vague replies.
- **Never push without fresh verification evidence.** If code changed after Step 3 tests, re-run before pushing.
- **Step 3.4 generates coverage tests.** They must pass before committing. Never commit failing tests.
- **The goal is: user says `/ship`, next thing they see is the review + PR URL + auto-synced docs.**
