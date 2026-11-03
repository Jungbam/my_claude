## Design Outside Voices (parallel)

**Automatic:** Outside voices run automatically when Codex is available. No opt-in needed.

**Check Codex availability:**
```bash
which codex 2>/dev/null && echo "CODEX_AVAILABLE" || echo "CODEX_NOT_AVAILABLE"
```

**If Codex is available**, launch both voices simultaneously:

1. **Codex design voice** (via Bash):
```bash
TMPERR_DESIGN=$(mktemp /tmp/codex-design-XXXXXXXX)
codex exec "Review the frontend source code in this repo. Evaluate against these design hard rules:
- Spacing: systematic (design tokens / CSS variables) or magic numbers?
- Typography: expressive purposeful fonts or default stacks?
- Color: CSS variables with defined system, or hardcoded hex scattered?
- Responsive: breakpoints defined? calc(100svh - header) for heroes? Mobile tested?
- A11y: ARIA landmarks, alt text, contrast ratios, 44px touch targets?
- Motion: 2-3 intentional animations, or zero / ornamental only?
- Cards: used only when card IS the interaction? No decorative card grids?

First classify as MARKETING/LANDING PAGE vs APP UI vs HYBRID, then apply matching rules.

LITMUS CHECKS — answer YES/NO:
1. Brand/product unmistakable in first screen?
2. One strong visual anchor present?
3. Page understandable by scanning headlines only?
4. Each section has one job?
5. Are cards actually necessary?
6. Does motion improve hierarchy or atmosphere?
7. Would design feel premium with all decorative shadows removed?

HARD REJECTION — flag if ANY apply:
1. Generic SaaS card grid as first impression
2. Beautiful image with weak brand
3. Strong headline with no clear action
4. Busy imagery behind text
5. Sections repeating same mood statement
6. Carousel with no narrative purpose
7. App UI made of stacked cards instead of layout

Be specific. Reference file:line for every finding." -s read-only -c 'model_reasoning_effort="high"' --enable web_search_cached 2>"$TMPERR_DESIGN"
```
Use a 5-minute timeout (`timeout: 300000`). After the command completes, read stderr:
```bash
cat "$TMPERR_DESIGN" && rm -f "$TMPERR_DESIGN"
```

2. **Claude design subagent** (via Agent tool):
Dispatch a subagent with this prompt:
"Review the frontend source code in this repo. You are an independent senior product designer doing a source-code design audit. Focus on CONSISTENCY PATTERNS across files rather than individual violations:
- Are spacing values systematic across the codebase?
- Is there ONE color system or scattered approaches?
- Do responsive breakpoints follow a consistent set?
- Is the accessibility approach consistent or spotty?

For each finding: what's wrong, severity (critical/high/medium), and the file:line."

**Error handling (all non-blocking):**
- **Auth failure:** If stderr contains "auth", "login", "unauthorized", or "API key": "Codex authentication failed. Run `codex login` to authenticate."
- **Timeout:** "Codex timed out after 5 minutes."
- **Empty response:** "Codex returned no response."
- On any Codex error: proceed with Claude subagent output only, tagged `[single-model]`.
- If Claude subagent also fails: "Outside voices unavailable — continuing with primary review."

Present Codex output under a `CODEX SAYS (design source audit):` header.
Present subagent output under a `CLAUDE SUBAGENT (design consistency):` header.

**Synthesis — Litmus scorecard:**

Use the same scorecard format as /plan-design-review (shown above). Fill in from both outputs.
Merge findings into the triage with `[codex]` / `[subagent]` / `[cross-model]` tags.

**Log the result:**
```bash
"$_GSTACK_BIN"/gstack-review-log '{"skill":"design-outside-voices","timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","status":"STATUS","source":"SOURCE","commit":"'"$(git rev-parse --short HEAD)"'"}'
```
Replace STATUS with "clean" or "issues_found", SOURCE with "codex+subagent", "codex-only", "subagent-only", or "unavailable".
