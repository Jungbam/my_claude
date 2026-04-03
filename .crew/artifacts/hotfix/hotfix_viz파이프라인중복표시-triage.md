# Triage: viz 파이프라인 중복 표시 버그

> slug: hotfix_viz파이프라인중복표시
> 작성일: 2026-04-03
> 심각도: Critical (viz 대시보드에서 파이프라인 이력 왜곡)
> 상태: 수정 진행 중

## 1. 버그 요약

viz 대시보드에서 하나의 파이프라인 실행이 3개의 별도 항목으로 표시되는 문제.
실제 로그는 마지막 파일 하나에만 존재하며 나머지 2개는 이벤트가 1건씩만 존재하는 단편 파일.

## 2. 근본 원인 분석

### 원인 A: slug에 _상태 suffix — slug immutability 위반

**현재 네이밍 규칙:** `{command}_{한글요약}_{상태}`

pipeline_start 시 `hotfix_X_진행중`, pipeline_end 시 `hotfix_X_완료`로 slug를 변경함.
emit.sh는 slug를 파일명으로 직접 사용하므로 별도 JSONL 파일이 2개 생성됨.

**설계 원칙 위반:** slug는 파이프라인 수명 동안 불변(immutable)이어야 함.
상태는 이벤트 내부의 pipeline_start/pipeline_end로 판별해야 함.

실제 발생 파일:
- `hotfix_위임원칙강제적용_진행중-events.jsonl` (pipeline_start 1건)
- `hotfix_위임원칙강제적용_완료-events.jsonl` (pipeline_end 1건)

### 원인 B: pipeline-orchestrator가 자체 slug 생성

pipeline-orchestrator가 커맨드에서 전달받은 slug(`hotfix_위임원칙강제적용_진행중`)를
무시하고 자체적으로 kebab-case slug(`hotfix-enforce-pipeline-delegation-triage`)를 생성.

agent_start/agent_end 이벤트가 orchestrator 자체 slug 파일에 기록됨.

생성된 파일:
- `hotfix-enforce-pipeline-delegation-triage-events.jsonl` (agent 이벤트 4건 — 실질적 로그)

## 3. 영향 범위

| 영역 | 영향 | 심각도 |
|------|------|--------|
| viz 파이프라인 목록 | 1개 실행 → 3개로 표시 | Critical |
| 파이프라인 상세 보기 | 각 파일에 이벤트 분산 → 상세 내용 없음처럼 보임 | Critical |
| 실제 데이터 손실 | 없음 (파일은 모두 존재) | None |
| 기능 동작 | 파이프라인 실행 자체는 정상 | None |

## 4. 수정 계획

### 수정 A: pipeline-naming-convention.md
- slug 형식에서 `_상태` 제거
- AS-IS: `{command}_{한글요약}_{상태}`
- TO-BE: `{command}_{한글요약}`
- 상태 판별: 이벤트 파일의 pipeline_end 존재 여부로 자동 판별 (viz parser.ts 이미 지원)

### 수정 B: CLAUDE.md 섹션 2 업데이트
- 네이밍 규칙 섹션을 TO-BE 형식으로 변경

### 수정 C: init.md Step 11 업데이트
- CLAUDE.md에 삽입하는 네이밍 규칙 섹션 동기화

### 수정 D: viz-agent-protocol.md 신규 생성
- orchestrator가 agent_start/agent_end emit 시 반드시 커맨드 전달 slug를 사용하는 규칙 명확화

### 수정 E: 중복 이벤트 파일 정리
- 기존 3개 파일 삭제 (데이터 손실 없음 — 실질적 이벤트는 hotfix-enforce 파일에 있으나 이미 완료된 파이프라인)

## 5. viz parser.ts 상태 판별 로직 확인

`parser.ts` buildPipeline()에서:
- 초기값: `status: 'running'`
- `pipeline_end` 이벤트 발생 시 → `pipeline.status = e.status` (completed/failed 등)
- 파일이 나뉘어지면 `pipeline_start`만 있는 파일은 영원히 'running'으로 표시됨

수정 후 slug가 불변이면 하나의 파일에 모든 이벤트가 기록되어 정상 동작.

## 6. 예방 조치

viz-agent-protocol.md에 다음 규칙 명문화:
1. orchestrator는 커맨드에서 전달받은 slug를 session 동안 불변으로 사용
2. 파이프라인 종료 시에도 slug 변경 금지 — pipeline_end 이벤트로 상태 기록
3. agent_start/agent_end에 pipeline_slug 필드를 반드시 포함
