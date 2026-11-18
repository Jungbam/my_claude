## Output Structure

Each QA run writes to its own run directory `<run>`:

```
<run> = .crew/artifacts/qa/{YYYY-MM-DD}-{scope}[-n]/
```

- `scope`: `explore-{domain}` (exploratory QA) or `audit-{axes}` (`--audit`, e.g. `audit-a11y-perf`)
- `-n`: append `-2`, `-3`, ... when a run directory with the same date and scope already exists — never overwrite a previous run

```
.crew/artifacts/qa/{YYYY-MM-DD}-{scope}[-n]/     # <run>
├── report.md                              # Structured report — first line is the verdict line
├── screens/
│   ├── initial.png                        # Landing page annotated screenshot
│   ├── issue-001-step-1.png               # Per-issue evidence
│   ├── issue-001-result.png
│   ├── issue-001-before.png               # Before fix (if fixed)
│   ├── issue-001-after.png                # After fix (if fixed)
│   └── ...
├── *.json | *.jsonl | *.md                # Raw evidence (script output, logs), if any
└── baseline.json                          # For regression mode
```

File naming:
- The report is always `<run>/report.md`. Domain and date live in the directory name, not the file name (e.g. `.crew/artifacts/qa/2026-03-12-explore-myapp-com/report.md`).
- Screenshots go under `<run>/screens/` as `initial.png`, `issue-NNN-{step-N|result|before|after}.png`, `{page-name}.png`.
- Regression baseline is `<run>/baseline.json`. `--regression` without a path uses the most recent `.crew/artifacts/qa/*/baseline.json`.

---
