# 에이전트 메모리 규칙 (SSOT · L0 stub)

에이전트별 학습은 **`.crew/memory/{agent-slug}/MEMORY.md` 1파일**에만 둔다(PARA·세션 로그·`improvements/` 폐지). 항목 1개 = 원자적 교훈 1건.

```markdown
## {lesson-id} · conf: low|med|high · seen: N · last: YYYY-MM-DD
- when: {적용 상황 1줄}
- do: {행동 1줄}
- evidence: {pipeline-slug}[, ...]   # 최근 3개까지
```

- **읽기**: 세션 시작 시 파일이 있으면 Read, 없으면 생략(생성하지 않음). `conf: low`는 참고만 한다.
- **쓰기·유지**(회고 전용 — 신뢰도·10항목/3,000자 상한·90일 TTL·구형식 전환): `references/retro-protocol.md` §5-2. 정의 파일 승격: `references/agent-improvement-protocol.md` §5.
- **구조가 메모리다**: MEMORY.md는 판단이 필요한 교훈만 둔다. 교훈이 architecture·type·hook/lint/CI·test로 강제되면(`retro-protocol.md` §3-1-a 증명 통과) 항목을 삭제한다. 상한은 그대로다.
