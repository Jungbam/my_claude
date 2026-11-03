## Step 8.75: Persist ship metrics

Log coverage and plan completion data so `/retro` can track trends:

```bash
eval "$("$_GSTACK_BIN"/gstack-slug 2>/dev/null)" && mkdir -p .crew/artifacts/review
```

Append to `.crew/artifacts/review/$BRANCH-reviews.jsonl`:

```bash
echo '{"skill":"ship","timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","coverage_pct":COVERAGE_PCT,"plan_items_total":PLAN_TOTAL,"plan_items_done":PLAN_DONE,"verification_result":"VERIFY_RESULT","version":"VERSION","branch":"BRANCH"}' >> .crew/artifacts/review/$BRANCH-reviews.jsonl
```

Substitute from earlier steps:
- **COVERAGE_PCT**: coverage percentage from Step 3.4 diagram (integer, or -1 if undetermined)
- **PLAN_TOTAL**: total plan items extracted in Step 3.45 (0 if no plan file)
- **PLAN_DONE**: count of DONE + CHANGED items from Step 3.45 (0 if no plan file)
- **VERIFY_RESULT**: "pass", "fail", or "skipped" from Step 3.47
- **VERSION**: from the VERSION file
- **BRANCH**: current branch name

This step is automatic — never skip it, never ask for confirmation.

---
