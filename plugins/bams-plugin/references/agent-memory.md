# 에이전트 메모리 규칙 (SSOT · L0 stub)

에이전트별 장기 메모리는 **`.crew/memory/{agent-slug}/MEMORY.md` 1파일**만 사용한다. PARA 하위 구조·날짜별 세션 로그·`improvements/` 하위 디렉터리는 모두 폐지한다.

- **읽기**: 세션 시작 시 `MEMORY.md`가 있으면 Read, 없으면 생략(세션 시작만으로 생성하지 않음).
- **쓰기**: **회고 파이프라인의 개선 Phase에서만** append. 형식 `## [YYYY-MM-DD] {pipeline-slug}` + 교훈 불릿(최대 3).
- **상한**(CLAUDE.md §5): 파일당 최대 10항목(초과 시 오래된 항목부터 제거), 6개월 경과 항목 삭제.
