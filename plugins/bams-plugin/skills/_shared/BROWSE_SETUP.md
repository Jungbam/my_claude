## SETUP (run this check BEFORE any browse command)

```bash
B="${CLAUDE_SKILL_DIR}/../browse/bin/browse"
[ -x "$B" ] || B=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/browse/bin/browse" -type f 2>/dev/null | head -1)
[ -x "$B" ] && echo "READY: $B" || echo "NEEDS_SETUP"
```

If `NEEDS_SETUP`: ask the user "browse needs a one-time build (~10 seconds). OK to proceed?" and wait. Then run `bash <bams-plugin dir>/setup.sh` (needs `bun`; install with `curl -fsSL https://bun.sh/install | bash`).
Each Bash call is a fresh shell: set `B=<path printed after READY>` in every command that uses `$B`.
