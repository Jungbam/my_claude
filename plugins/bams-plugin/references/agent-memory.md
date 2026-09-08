# 에이전트 메모리 규칙 (SSOT)

에이전트별 장기 메모리는 **`.crew/memory/{agent-slug}/MEMORY.md` 1파일**만 사용한다. PARA 하위 구조(`life/`, `areas/`, `resources/`, `archives/`), 날짜별 세션 로그(`memory/YYYY-MM-DD.md`), `improvements/` 하위 디렉터리는 모두 폐지한다.

## 세션 시작 시 (읽기)

- `.crew/memory/{agent-slug}/MEMORY.md`가 존재하면 Read하여 이전 교훈을 로드한다.
- 없으면 생략한다. **세션 시작만으로 파일을 생성하지 않는다.**

## 기록 시점 (쓰기)

- 기록은 **회고 파이프라인의 개선 Phase에서만** 수행한다. 에이전트가 파이프라인 완료 시 자발적으로 MEMORY.md를 갱신하는 규칙은 폐지한다.
- 회고가 산출한 교훈을 MEMORY.md 항목으로 append한다. 별도 `improvements/*.md` 파일을 신규 생성하지 않는다(기존 파일은 삭제하지 않되 참조만).

## 형식

```markdown
## [YYYY-MM-DD] {pipeline-slug}
- [교훈 불릿 — 최대 3개]
```

## 상한 (CLAUDE.md §5)

- 파일당 최대 10항목. 초과 시 가장 오래된 항목부터 제거한다.
- 6개월 경과 항목은 삭제한다.
