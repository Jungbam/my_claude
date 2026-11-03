## Step 8.5: Auto-invoke /document-release

After the PR is created, automatically sync project documentation. Read the
`document-release/SKILL.md` skill file (adjacent to this skill's directory) and
execute its full workflow:

1. Read the `/document-release` skill: `cat ${CLAUDE_SKILL_DIR}/../document-release/SKILL.md`
2. Follow its instructions — it reads all .md files in the project, cross-references
   the diff, and updates anything that drifted (README, ARCHITECTURE, CONTRIBUTING,
   CLAUDE.md, TODOS, etc.)
3. If any docs were updated, commit the changes and push to the same branch. Apply Step 6-6 staging hygiene — stage the changed doc paths by name, never `git add -A`:
   ```bash
   git reset
   git add <changed doc paths>   # e.g. README.md ARCHITECTURE.md CLAUDE.md — never git add -A
   git diff --cached --name-only  # confirm only the intended docs are staged
   git commit -m "docs: sync documentation with shipped changes" && git push
   ```
4. If no docs needed updating, say "Documentation is current — no updates needed."

This step is automatic. Do not ask the user for confirmation. The goal is zero-friction
doc updates — the user runs `/ship` and documentation stays current without a separate command.

---
