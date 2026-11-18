<!-- AUTO-GENERATED from report.md.tmpl — do not edit directly -->
<!-- Regenerate: bash scripts/gen-skill-docs.sh -->
## Phase 10: Report

Write the report to the run directory (see `output-structure.md`):

**Local:** `<run>/report.md` (`<run>` = `.crew/artifacts/qa/{YYYY-MM-DD}-{scope}[-n]/`)

**Verdict line (first line of the report):** verdict, counts by severity, and the number of unverified core paths, e.g.
`판정: CONDITIONAL-GO — Critical 0 / Major 1 / Minor 3 · 핵심 경로 미검증 0`
Map severities and decide the verdict with `${CLAUDE_SKILL_DIR}/../../references/issue-severity.md` §QA 판정 매핑 — do not restate thresholds here. If any core path is unverified, the verdict cannot be GO.

**Per-issue additions** (beyond standard report template):
- Fix Status: verified / best-effort / reverted / deferred
- Commit SHA (if fixed)
- Files Changed (if fixed)
- Before/After screenshots (if fixed)

**Summary section:**
- Verdict line (same as the first line)
- Coverage denominator: discovered pages D / visited V / viewports K / reason for each unvisited page (diff-aware: affected routes R, tested T)
- Total issues found (confirmed defects only — unconfirmed candidates are not counted)
- Fixes applied (verified: X, best-effort: Y, reverted: Z)
- Deferred issues
- Unverified items (`unverified`): what was not checked and why (blocked step, repo constraint, missing tool), core paths marked
- Health score delta: baseline → final (reference metric, not a gate)

**PR Summary:** Include a one-line summary suitable for PR descriptions:
> "QA {verdict}: found N issues, fixed M, health score X → Y, unverified U."

---
