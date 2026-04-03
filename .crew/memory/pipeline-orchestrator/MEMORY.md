# MEMORY.md — pipeline-orchestrator

> 역할: 
> 생성: 2026-04-03
> 형식: PARA (Projects / Areas / Resources / Archives)

---

## 메모리 프로토콜

### 세션 시작 시
1. 이 파일(`MEMORY.md`)을 Read하여 이전 학습 항목과 gotcha를 컨텍스트에 로드한다
2. 현재 파이프라인 슬러그가 있으면 `.crew/memory/pipeline-orchestrator/life/projects/{slug}/summary.md`도 로드한다
3. qmd가 설치된 환경이면 `qmd query "관련 키워드"`로 연관 메모리 검색

### 세션 종료 시 (파이프라인 회고)
1. 이번 파이프라인에서 발견한 새로운 패턴/gotcha를 아래 "학습 항목" 섹션에 날짜와 함께 추가한다
2. 내구성 있는 사실은 PARA 구조(`life/`)에 기록한다
3. 오늘의 주요 작업은 `memory/YYYY-MM-DD.md`에 기록한다
4. 글로벌 gotcha는 pipeline-orchestrator 판단으로 `.crew/gotchas.md`로 승격된다

---

## 학습 항목 (Tacit Knowledge)

<!-- 형식:
## [YYYY-MM-DD] {pipeline-slug}
- 발견 사항: [설명]
- 적용 패턴: [설명]
- 주의사항: [설명]
-->

## [2026-04-03] hotfix_viz파이프라인중복표시
- 발견 사항: slug에 `_상태` suffix(`_진행중`, `_완료`)를 붙이면 emit.sh가 slug를 파일명으로 사용하므로 별도 JSONL 파일이 생성됨. orchestrator가 커맨드 전달 slug를 무시하고 자체 kebab-case slug를 생성하면 3번째 파일이 추가로 생성됨. 결과적으로 viz에서 1개 파이프라인이 3개로 분리 표시됨.
- 적용 패턴: slug는 pipeline_start 시 결정하고 파이프라인 수명 동안 불변으로 유지. 상태(`진행중`/`완료`)는 slug에 포함하지 않고 pipeline_start/pipeline_end 이벤트로 판별. orchestrator는 커맨드 전달 slug만 사용하고 자체 slug를 생성하지 않음.
- 주의사항: bams-viz-emit.sh는 slug를 그대로 파일명으로 사용하므로 slug 변경 = 새 파일 생성. viz-agent-protocol.md에 이 규칙 명문화 완료. pipeline-naming-convention.md에서 `_상태` 제거 완료.

---

## PARA 구조 안내

| 경로 | 용도 |
|------|------|
| `life/projects/` | 목표/기한이 있는 활성 프로젝트 작업 기록 |
| `life/areas/` | 지속적 책임 영역 (프로젝트별 컨벤션, 패턴 등) |
| `life/resources/` | 참조 자료 (API 문서, 프로토콜, 설계 패턴 등) |
| `life/archives/` | 완료/중단된 항목 (영구 보존) |
| `memory/YYYY-MM-DD.md` | 일별 실행 raw 로그 |


## [2026-04-03] hotfix_viz한글slug검증
- 발견 사항: event-store.ts의 validateParam이 ASCII 전용 regex(`[a-zA-Z0-9_\-]`)를 사용하여 한글 slug를 완전히 차단. 상위 파이프라인(hotfix_viz파이프라인중복표시)에서 한글 slug 네이밍 규칙을 채택한 직후 발생.
- 적용 패턴: Unicode-aware regex(`/^[\p{L}\p{N}_\-]{1,256}$/u`)로 교체. `\p{L}` = 모든 유니코드 문자(한글 포함), `\p{N}` = 모든 유니코드 숫자. `/u` 플래그 필수. path traversal(`/`, `\`, `..`)은 이 문자 클래스에 포함되지 않으므로 자동 차단됨.
- 주의사항: slug 검증 regex를 ASCII 전용으로 작성하면 다국어 slug 도입 시 전체 viz 탭이 silent throw로 장애남. 신규 param 검증 코드 작성 시 반드시 Unicode-aware 패턴 사용. 길이 제한도 128 → 256으로 확장하여 긴 한글 slug 수용.

## [2026-04-03] hotfix_emitsh한글바이트절단
- 발견 사항: bash의 `head -c N`은 바이트 단위 절단이므로 한글(UTF-8 3바이트/글자)이 포함된 문자열을 자를 때 멀티바이트 경계 중간에서 잘려 invalid UTF-8이 생성됨. jq `--arg`로 파싱 시 오류 발생하여 viz 이벤트 기록이 silent fail됨.
- 적용 패턴: `head -c N` → `cut -c1-N`으로 교체. macOS/Linux 모두 `LC_ALL=en_US.UTF-8` 환경에서 `cut -c`는 문자(character) 단위로 동작하여 멀티바이트 경계를 올바르게 처리함. 소스 파일과 캐시 파일 양쪽 모두 수정 필요.
- 주의사항: bash 스크립트에서 다국어 텍스트를 길이 제한할 때는 반드시 `cut -c`(문자 단위) 또는 `awk substr`를 사용. `head -c`, `dd bs=1`처럼 바이트 단위 도구는 비ASCII 입력에 unsafe. 이 패턴은 `prompt_summary`/`input`/`result_summary`/`output` 4곳 모두 동일하게 적용됨.
