#!/usr/bin/env bash
#
# init.sh — Bootstrap my_claude on a new machine after migration.
#
# Idempotent. Safe to re-run.
#
# What it does:
#   1. chmod +x all .sh hook scripts inside plugins/
#   2. Repair (or create) the marketplace symlink at
#      ~/.claude/plugins/marketplaces/my-claude → this repo
#   3. Rewrite stale `/Users/<other>/.claude` and
#      `/Users/<other>/Documents/ezar/claude/my_claude` paths inside
#      ~/.claude config files so hooks resolve on the current machine.
#
# Usage:
#   git clone git@github.com:Jungbam/my_claude.git ~/Documents/ezar/claude/my_claude
#   ~/Documents/ezar/claude/my_claude/init.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="$HOME"
CLAUDE_DIR="$HOME_DIR/.claude"
MARKETPLACE_LINK="$CLAUDE_DIR/plugins/marketplaces/my-claude"

echo "my_claude bootstrap"
echo "  repo: $REPO_DIR"
echo "  home: $HOME_DIR"
echo

# ── 1. Make hook / shell scripts executable ───────────────────────────
echo "==> chmod +x scripts under plugins/"
find "$REPO_DIR/plugins" -name '*.sh' -exec chmod +x {} \; 2>/dev/null || true

# ── 2. Repair marketplace symlink ─────────────────────────────────────
echo "==> marketplace symlink"
mkdir -p "$(dirname "$MARKETPLACE_LINK")"
if [[ -L "$MARKETPLACE_LINK" ]]; then
    current_target=$(readlink "$MARKETPLACE_LINK")
    if [[ "$current_target" == "$REPO_DIR" ]]; then
        echo "  already correct: $MARKETPLACE_LINK"
    else
        rm "$MARKETPLACE_LINK"
        ln -s "$REPO_DIR" "$MARKETPLACE_LINK"
        echo "  updated: $current_target -> $REPO_DIR"
    fi
elif [[ -e "$MARKETPLACE_LINK" ]]; then
    echo "  ⚠ $MARKETPLACE_LINK exists and is not a symlink — leaving alone"
else
    ln -s "$REPO_DIR" "$MARKETPLACE_LINK"
    echo "  created: $MARKETPLACE_LINK -> $REPO_DIR"
fi

# ── 3. Rewrite stale absolute paths ───────────────────────────────────
# Match any /Users/<user>/(.claude|Documents/ezar/claude/my_claude) and
# rewrite to current $HOME. This catches hook commands and marketplace
# install locations baked in by another machine.
echo "==> rewrite stale absolute paths"
patched=0
for f in "$CLAUDE_DIR/settings.json" \
         "$CLAUDE_DIR/settings.json.backup" \
         "$CLAUDE_DIR/settings.local.json" \
         "$HOME_DIR/.claude.json" \
         "$CLAUDE_DIR/plugins/known_marketplaces.json" \
         "$CLAUDE_DIR/plugins/installed_plugins.json"; do
    [[ -f "$f" ]] || continue
    # Run the rewrite, then compare against the .tmp backup BSD sed leaves
    # behind. Only report when bytes actually changed.
    sed -i.tmp -E "s#/Users/[^/\"]+/(\.claude|Documents/ezar/claude/my_claude)#$HOME_DIR/\1#g" "$f"
    if ! cmp -s "$f.tmp" "$f"; then
        echo "  patched: $f"
        patched=$((patched + 1))
    fi
    rm -f "$f.tmp"
done
[[ $patched -eq 0 ]] && echo "  no changes needed"

echo
echo "✓ bootstrap done. Restart Claude Code to pick up changes."
