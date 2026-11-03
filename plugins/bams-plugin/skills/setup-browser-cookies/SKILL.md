---
name: setup-browser-cookies
preamble-tier: 1
version: 1.0.0
description: |
  Import cookies from your real Chromium browser into the headless browse session.
  Opens an interactive picker UI where you select which cookie domains to import.
  Use before QA testing authenticated pages. Use when asked to "import cookies",
  "login to the site", or "authenticate the browser".
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
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

# Setup Browser Cookies

Import logged-in sessions from your real Chromium browser into the headless browse session.

## How it works

1. Find the browse binary
2. Run `cookie-import-browser` to detect installed browsers and open the picker UI
3. User selects which cookie domains to import in their browser
4. Cookies are decrypted and loaded into the Playwright session

## Steps

### 1. Find the browse binary

## SETUP (run this check BEFORE any browse command)

```bash
B="${CLAUDE_SKILL_DIR}/../browse/bin/browse"
[ -x "$B" ] || B=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/browse/bin/browse" -type f 2>/dev/null | head -1)
[ -x "$B" ] && echo "READY: $B" || echo "NEEDS_SETUP"
```

If `NEEDS_SETUP`: ask the user "browse needs a one-time build (~10 seconds). OK to proceed?" and wait. Then run `bash <bams-plugin dir>/setup.sh` (needs `bun`; install with `curl -fsSL https://bun.sh/install | bash`).
Each Bash call is a fresh shell: set `B=<path printed after READY>` in every command that uses `$B`.

### 2. Open the cookie picker

```bash
$B cookie-import-browser
```

This auto-detects installed Chromium browsers and opens
an interactive picker UI in your default browser where you can:
- Switch between installed browsers
- Search domains
- Click "+" to import a domain's cookies
- Click trash to remove imported cookies

Tell the user: **"Cookie picker opened — select the domains you want to import in your browser, then tell me when you're done."**

### 3. Direct import (alternative)

If the user specifies a domain directly (e.g., `/setup-browser-cookies github.com`), skip the UI:

```bash
$B cookie-import-browser comet --domain github.com
```

Replace `comet` with the appropriate browser if specified.

### 4. Verify

After the user confirms they're done:

```bash
$B cookies
```

Show the user a summary of imported cookies (domain counts).

## Notes

- On macOS, the first import per browser may trigger a Keychain dialog — click "Allow" / "Always Allow"
- On Linux, `v11` cookies may require `secret-tool`/libsecret access; `v10` cookies use Chromium's standard fallback key
- Cookie picker is served on the same port as the browse server (no extra process)
- Only domain names and cookie counts are shown in the UI — no cookie values are exposed
- The browse session persists cookies between commands, so imported cookies work immediately
