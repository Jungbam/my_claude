## Step 5.5: TODOS.md (auto-update)

Cross-reference the project's TODOS.md against the changes being shipped. Mark completed items automatically; prompt only if the file is missing or disorganized.

Read `.claude/skills/review/TODOS-format.md` for the canonical format reference.

**1. Check if TODOS.md exists** in the repository root.

**If TODOS.md does not exist:** Use AskUserQuestion:
- Message: "GStack recommends maintaining a TODOS.md organized by skill/component, then priority (P0 at top through P4, then Completed at bottom). See TODOS-format.md for the full format. Would you like to create one?"
- Options: A) Create it now, B) Skip for now
- If A: Create `TODOS.md` with a skeleton (# TODOS heading + ## Completed section). Continue to step 3.
- If B: Skip the rest of Step 5.5. Continue to Step 6.

**2. Check structure and organization:**

Read TODOS.md and verify it follows the recommended structure:
- Items grouped under `## <Skill/Component>` headings
- Each item has `**Priority:**` field with P0-P4 value
- A `## Completed` section at the bottom

**If disorganized** (missing priority fields, no component groupings, no Completed section): Use AskUserQuestion:
- Message: "TODOS.md doesn't follow the recommended structure (skill/component groupings, P0-P4 priority, Completed section). Would you like to reorganize it?"
- Options: A) Reorganize now (recommended), B) Leave as-is
- If A: Reorganize in-place following TODOS-format.md. Preserve all content — only restructure, never delete items.
- If B: Continue to step 3 without restructuring.

**3. Detect completed TODOs:**

This step is fully automatic — no user interaction.

Use the diff and commit history already gathered in earlier steps:
- `git diff <base>...HEAD` (full diff against the base branch)
- `git log <base>..HEAD --oneline` (all commits being shipped)

For each TODO item, check if the changes in this PR complete it by:
- Matching commit messages against the TODO title and description
- Checking if files referenced in the TODO appear in the diff
- Checking if the TODO's described work matches the functional changes

**Be conservative:** Only mark a TODO as completed if there is clear evidence in the diff. If uncertain, leave it alone.

**4. Move completed items** to the `## Completed` section at the bottom. Append: `**Completed:** vX.Y.Z (YYYY-MM-DD)`

**5. Output summary:**
- `TODOS.md: N items marked complete (item1, item2, ...). M items remaining.`
- Or: `TODOS.md: No completed items detected. M items remaining.`
- Or: `TODOS.md: Created.` / `TODOS.md: Reorganized.`

**6. Defensive:** If TODOS.md cannot be written (permission error, disk full), warn the user and continue. Never stop the ship workflow for a TODOS failure.

Save this summary — it goes into the PR body in Step 8.

---
