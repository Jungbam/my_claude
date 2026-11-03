## Phase 3.5: Cross-Model Second Opinion (optional)

**Binary check first — no question if unavailable:**

```bash
which codex 2>/dev/null && echo "CODEX_AVAILABLE" || echo "CODEX_NOT_AVAILABLE"
```

If `CODEX_NOT_AVAILABLE`: skip Phase 3.5 entirely — no message, no AskUserQuestion. Proceed directly to Phase 4.

If `CODEX_AVAILABLE`: use AskUserQuestion:

> Want a second opinion from a different AI model? Codex will independently review your problem statement, key answers, premises, and any landscape findings from this session. It hasn't seen this conversation — it gets a structured summary. Usually takes 2-5 minutes.
> A) Yes, get a second opinion
> B) No, proceed to alternatives

If B: skip Phase 3.5 entirely. Remember that Codex did NOT run (affects design doc, founder signals, and Phase 4 below).

**If A: Run the Codex cold read.**

1. Assemble a structured context block from Phases 1-3:
   - Mode (Startup or Builder)
   - Problem statement (from Phase 1)
   - Key answers from Phase 2A/2B (summarize each Q&A in 1-2 sentences, include verbatim user quotes)
   - Landscape findings (from Phase 2.75, if search was run)
   - Agreed premises (from Phase 3)
   - Codebase context (project name, languages, recent activity)

2. **Write the assembled prompt to a temp file** (prevents shell injection from user-derived content):

```bash
CODEX_PROMPT_FILE=$(mktemp /tmp/gstack-codex-oh-XXXXXXXX.txt)
```

Write the full prompt (context block + instructions) to this file. Use the mode-appropriate variant:

**Startup mode instructions:** "You are an independent technical advisor reading a transcript of a startup brainstorming session. [CONTEXT BLOCK HERE]. Your job: 1) What is the STRONGEST version of what this person is trying to build? Steelman it in 2-3 sentences. 2) What is the ONE thing from their answers that reveals the most about what they should actually build? Quote it and explain why. 3) Name ONE agreed premise you think is wrong, and what evidence would prove you right. 4) If you had 48 hours and one engineer to build a prototype, what would you build? Be specific — tech stack, features, what you'd skip. Be direct. Be terse. No preamble."

**Builder mode instructions:** "You are an independent technical advisor reading a transcript of a builder brainstorming session. [CONTEXT BLOCK HERE]. Your job: 1) What is the COOLEST version of this they haven't considered? 2) What's the ONE thing from their answers that reveals what excites them most? Quote it. 3) What existing open source project or tool gets them 50% of the way there — and what's the 50% they'd need to build? 4) If you had a weekend to build this, what would you build first? Be specific. Be direct. No preamble."

3. Run Codex:

```bash
TMPERR_OH=$(mktemp /tmp/codex-oh-err-XXXXXXXX)
codex exec "$(cat "$CODEX_PROMPT_FILE")" -s read-only -c 'model_reasoning_effort="xhigh"' --enable web_search_cached 2>"$TMPERR_OH"
```

Use a 5-minute timeout (`timeout: 300000`). After the command completes, read stderr:
```bash
cat "$TMPERR_OH"
rm -f "$TMPERR_OH" "$CODEX_PROMPT_FILE"
```

**Error handling:** All errors are non-blocking — Codex second opinion is a quality enhancement, not a prerequisite.
- **Auth failure:** If stderr contains "auth", "login", "unauthorized", or "API key": "Codex authentication failed. Run \`codex login\` to authenticate. Skipping second opinion."
- **Timeout:** "Codex timed out after 5 minutes. Skipping second opinion."
- **Empty response:** "Codex returned no response. Stderr: <paste relevant error>. Skipping second opinion."

On any error, proceed to Phase 4 — do NOT fall back to a Claude subagent (this is brainstorming, not adversarial review).

4. **Presentation:**

```
SECOND OPINION (Codex):
════════════════════════════════════════════════════════════
<full codex output, verbatim — do not truncate or summarize>
════════════════════════════════════════════════════════════
```

5. **Cross-model synthesis:** After presenting Codex output, provide 3-5 bullet synthesis:
   - Where Claude agrees with Codex
   - Where Claude disagrees and why
   - Whether Codex's challenged premise changes Claude's recommendation

6. **Premise revision check:** If Codex challenged an agreed premise, use AskUserQuestion:

> Codex challenged premise #{N}: "{premise text}". Their argument: "{reasoning}".
> A) Revise this premise based on Codex's input
> B) Keep the original premise — proceed to alternatives

If A: revise the premise and note the revision. If B: proceed (and note that the user defended this premise with reasoning — this is a founder signal if they articulate WHY they disagree, not just dismiss).

---
