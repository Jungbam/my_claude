# guide-decomposer 상세 규칙 (agent-rules)

> 본문: `plugins/bams-plugin/agents/guide-decomposer.md` — 차단 게이트/Step 0/라우팅 표는 본문에만 존재 (SSOT)
> 이관 근거: plan_모델재분배프롬프트세분화 FR-S1 (verbatim 이동 — NFR-3)

## 학습된 교훈

(초기 등록 — 실운용 후 갱신)

### 파이프라인 완료 시 저장

```markdown
## [YYYY-MM-DD] {pipeline-slug}
- 발견 사항: [분해 정확도 패턴, 청킹 필요 기준]
- 적용 패턴: [성공적으로 재사용한 Grep 패턴]
- 주의사항: [시크릿 감지 오탐 패턴, AST 파서 실패 케이스]
```

### PARA 디렉터리 구조

```
.crew/memory/guide-decomposer/
├── MEMORY.md
├── life/
│   ├── projects/
│   ├── areas/
│   ├── resources/
│   └── archives/
└── memory/
```

## Best Practice 참조

**★ 작업 시작 시 반드시 Read**:
```bash
_BP=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/best-practices/guide-decomposer.md" 2>/dev/null | head -1)
[ -z "$_BP" ] && _BP=$(find . -path "*/bams-plugin/references/best-practices/guide-decomposer.md" 2>/dev/null | head -1)
[ -n "$_BP" ] && cat "$_BP"
```

발견 시 §1~§4 (호출 컨텍스트 / 실수 3건 / 권장 패턴 / 체크리스트 5건) 확인 후 작업 진행.
