## Pre-Gate Verification

Before presenting the Final Approval Gate, verify that required outputs were actually
produced. Check the plan file and conversation for each item.

**Phase 1 (CEO) outputs:**
- [ ] Premise challenge with specific premises named (not just "premises accepted")
- [ ] All applicable review sections have findings OR explicit "examined X, nothing flagged"
- [ ] Error & Rescue Registry table produced (or noted N/A with reason)
- [ ] Failure Modes Registry table produced (or noted N/A with reason)
- [ ] "NOT in scope" section written
- [ ] "What already exists" section written
- [ ] Dream state delta written
- [ ] Completion Summary produced
- [ ] Dual voices ran (Codex + Claude subagent, or noted unavailable)
- [ ] CEO consensus table produced

**Phase 2 (Design) outputs — only if UI scope detected:**
- [ ] All 7 dimensions evaluated with scores
- [ ] Issues identified and auto-decided
- [ ] Dual voices ran (or noted unavailable/skipped with phase)
- [ ] Design litmus scorecard produced

**Phase 3 (Eng) outputs:**
- [ ] Scope challenge with actual code analysis (not just "scope is fine")
- [ ] Architecture ASCII diagram produced
- [ ] Test diagram mapping codepaths to test coverage
- [ ] Test plan artifact written to disk at ~/.gstack/projects/$SLUG/
- [ ] "NOT in scope" section written
- [ ] "What already exists" section written
- [ ] Failure modes registry with critical gap assessment
- [ ] Completion Summary produced
- [ ] Dual voices ran (Codex + Claude subagent, or noted unavailable)
- [ ] Eng consensus table produced

**Cross-phase:**
- [ ] Cross-phase themes section written

**Audit trail:**
- [ ] Decision Audit Trail has at least one row per auto-decision (not empty)

If ANY checkbox above is missing, go back and produce the missing output. Max 2
attempts — if still missing after retrying twice, proceed to the gate with a warning
noting which items are incomplete. Do not loop indefinitely.

---
