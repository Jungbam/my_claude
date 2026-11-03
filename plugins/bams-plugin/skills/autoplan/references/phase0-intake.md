<!-- AUTO-GENERATED from phase0-intake.md.tmpl — do not edit directly -->
<!-- Regenerate: bash scripts/gen-skill-docs.sh -->
## Phase 0: Intake + Restore Point

### Step 1: Capture restore point

Before doing anything, save the plan file's current state to an external file:

```bash
eval "$("$_GSTACK_BIN"/gstack-slug 2>/dev/null)" && mkdir -p ~/.gstack/projects/$SLUG
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null | tr '/' '-')
DATETIME=$(date +%Y%m%d-%H%M%S)
echo "RESTORE_PATH=$HOME/.gstack/projects/$SLUG/${BRANCH}-autoplan-restore-${DATETIME}.md"
```

Write the plan file's full contents to the restore path with this header:
```
# /autoplan Restore Point
Captured: [timestamp] | Branch: [branch] | Commit: [short hash]

## Re-run Instructions
1. Copy "Original Plan State" below back to your plan file
2. Invoke /autoplan

## Original Plan State
[verbatim plan file contents]
```

Then prepend a one-line HTML comment to the plan file:
`<!-- /autoplan restore point: [RESTORE_PATH] -->`

### Step 2: Read context

- Read CLAUDE.md, TODOS.md, git log -30, git diff against the base branch --stat
- Discover design docs: `ls -t ~/.gstack/projects/$SLUG/*-design-*.md 2>/dev/null | head -1`
- Detect UI scope: grep the plan for view/rendering terms (component, screen, form,
  button, modal, layout, dashboard, sidebar, nav, dialog). Require 2+ matches. Exclude
  false positives ("page" alone, "UI" in acronyms).

### Step 3: Load skill files from disk

Read each file using the Read tool:
- `${CLAUDE_SKILL_DIR}/../plan-ceo-review/SKILL.md`
- `${CLAUDE_SKILL_DIR}/../plan-design-review/SKILL.md` (only if UI scope detected)
- `${CLAUDE_SKILL_DIR}/../plan-eng-review/SKILL.md`

Inside a loaded file, `${CLAUDE_SKILL_DIR}` means that file's own directory; read its `references/*.md` and `../_shared/*.md` pointers on demand the same way.

**Section skip list — when following a loaded skill file, SKIP these sections
(they are already handled by /autoplan):**
- Preamble (run first)
- AskUserQuestion Format
- Completion Status Protocol
- Step 0: Detect base branch
- Review Readiness Dashboard
- Plan File Review Report
- Prerequisite Skill Offer (BENEFITS_FROM)
- Outside Voice — Independent Plan Challenge
- Design Outside Voices (parallel)

Follow ONLY the review-specific methodology, sections, and required outputs.

Output: "Here's what I'm working with: [plan summary]. UI scope: [yes/no].
Loaded review skills from disk. Starting full review pipeline with auto-decisions."

---
