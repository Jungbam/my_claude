# guide-decomposer 상세 규칙 (agent-rules)

> 본문: `plugins/bams-plugin/agents/guide-decomposer.md` — 차단 게이트/Step 0/라우팅 표는 본문에만 존재 (SSOT)
> 이관 근거: plan_모델재분배프롬프트세분화 FR-S1 (verbatim 이동 — NFR-3)

## 메모리

메모리 규칙은 `references/agent-memory.md`를 따른다: `.crew/memory/{agent-slug}/MEMORY.md` 단일 파일, 세션 시작 시 존재하면 Read, 기록은 회고 파이프라인 수행.

## Best Practice 참조

**★ 작업 시작 시 반드시 Read**:
```bash
_BP=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/best-practices/guide-decomposer.md" 2>/dev/null | head -1)
[ -z "$_BP" ] && _BP=$(find . -path "*/bams-plugin/references/best-practices/guide-decomposer.md" 2>/dev/null | head -1)
[ -n "$_BP" ] && cat "$_BP"
```

발견 시 §1~§4 (호출 컨텍스트 / 실수 3건 / 권장 패턴 / 체크리스트 5건) 확인 후 작업 진행.
