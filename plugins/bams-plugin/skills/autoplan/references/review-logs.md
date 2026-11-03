## Completion: Write Review Logs

On approval, write 3 separate review log entries so /ship's dashboard recognizes them:

```bash
COMMIT=$(git rev-parse --short HEAD 2>/dev/null)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

"$_GSTACK_BIN"/gstack-review-log '{"skill":"plan-ceo-review","timestamp":"'"$TIMESTAMP"'","status":"clean","unresolved":0,"critical_gaps":0,"mode":"SELECTIVE_EXPANSION","via":"autoplan","commit":"'"$COMMIT"'"}'

"$_GSTACK_BIN"/gstack-review-log '{"skill":"plan-eng-review","timestamp":"'"$TIMESTAMP"'","status":"clean","unresolved":0,"critical_gaps":0,"issues_found":0,"mode":"FULL_REVIEW","via":"autoplan","commit":"'"$COMMIT"'"}'
```

If Phase 2 ran (UI scope):
```bash
"$_GSTACK_BIN"/gstack-review-log '{"skill":"plan-design-review","timestamp":"'"$TIMESTAMP"'","status":"clean","unresolved":0,"via":"autoplan","commit":"'"$COMMIT"'"}'
```

Replace field values with actual counts from the review.

Dual voice logs (one per phase that ran):
```bash
"$_GSTACK_BIN"/gstack-review-log '{"skill":"autoplan-voices","timestamp":"'"$TIMESTAMP"'","status":"STATUS","source":"SOURCE","phase":"ceo","via":"autoplan","consensus_confirmed":N,"consensus_disagree":N,"commit":"'"$COMMIT"'"}'

"$_GSTACK_BIN"/gstack-review-log '{"skill":"autoplan-voices","timestamp":"'"$TIMESTAMP"'","status":"STATUS","source":"SOURCE","phase":"eng","via":"autoplan","consensus_confirmed":N,"consensus_disagree":N,"commit":"'"$COMMIT"'"}'
```

If Phase 2 ran (UI scope), also log:
```bash
"$_GSTACK_BIN"/gstack-review-log '{"skill":"autoplan-voices","timestamp":"'"$TIMESTAMP"'","status":"STATUS","source":"SOURCE","phase":"design","via":"autoplan","consensus_confirmed":N,"consensus_disagree":N,"commit":"'"$COMMIT"'"}'
```

SOURCE = "codex+subagent", "codex-only", "subagent-only", or "unavailable".
Replace N values with actual consensus counts from the tables.

Suggest next step: `/ship` when ready to create the PR.

---
