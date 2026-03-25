---
description: PM + Architect 에이전트 역할로 피처 플래닝
argument-hint: <피처 또는 이슈 설명>
---

# Crew Plan

Crew 오케스트레이터로서 PM과 Architect 에이전트 역할을 활용한 플래닝 워크플로를 실행합니다.

기획할 피처/이슈: $ARGUMENTS

$ARGUMENTS가 비어있으면, 사용자에게 어떤 피처를 기획할지 물어보고 중단합니다.

## 코드 최신화

Bash로 `git rev-parse --is-inside-work-tree 2>/dev/null`를 실행하여 git 저장소인지 확인합니다.

**git 저장소인 경우**: Bash로 `git branch --show-current`를 실행하여 현재 브랜치를 확인한 뒤, `git pull origin {현재 브랜치}`를 실행하여 원격 저장소의 최신 코드를 가져옵니다. 충돌이 발생하면 사용자에게 알리고 중단합니다.

**git 저장소가 아닌 경우**: 이 단계를 스킵합니다.

## 사전 조건

Glob으로 `.crew/config.md`가 존재하는지 확인합니다. 없으면:
- 출력: "Crew가 초기화되지 않았습니다. `/crew:init`을 실행하여 설정하세요."
- 여기서 중단.

`.crew/config.md`와 `.crew/board.md`를 읽어 현재 상태를 파악합니다.

## Phase 1: PM 에이전트 - 요구사항 분석

**Task tool**을 사용하여 서브에이전트를 실행합니다 (subagent_type: **"common-plugin:pm-analyst"**, model: **"opus"**):

---

**PRD 작성 모드**로 다음 피처 요청을 분석하고 구조화된 PRD를 작성합니다.

**피처 요청**: [$ARGUMENTS 삽입]

**프로젝트 컨텍스트**: [.crew/config.md 내용 삽입]

**기존 코드베이스**: Glob과 Read 도구를 사용하여 기존 코드베이스 구조를 파악합니다.

---

PM 에이전트가 반환한 후, 출력을 주의 깊게 읽습니다.

**미결 질문이 있으면**: 불릿 포인트로 사용자에게 제시합니다. Phase 2로 진행하기 전에 사용자의 답변을 기다립니다. 이 단계를 절대 건너뛰지 마세요. 답변을 받은 후 PRD에 반영합니다.

## Phase 2: Architect 에이전트 - 기술 설계

Task tool을 사용하여 **2개 서브에이전트를 동시에 실행** (subagent_type: **"common-plugin:architect"**, model: **"sonnet"**):

### Architect 에이전트 1 - 코드베이스 분석:

---

**코드베이스 분석 모드**: 피처 구현을 위한 기존 코드베이스의 아키텍처를 분석합니다.

**피처 요구사항**: [Phase 1의 PRD 삽입]

---

### Architect 에이전트 2 - 설계 제안:

---

**기술 설계 모드**: 피처의 기술 구현을 설계합니다.

**피처 요구사항**: [Phase 1의 PRD 삽입]
**프로젝트 컨텍스트**: [.crew/config.md 내용 삽입]

---

## Phase 3: 태스크 분해

두 Architect 에이전트가 반환한 후, 결과를 종합하여 구체적인 태스크로 분해합니다:

1. 두 Architect 결과 읽기
2. 코드베이스 분석과 설계 제안 병합
3. 작업을 개별 태스크로 분해. 각 태스크는:
   - 한 세션에서 완료 가능 (Developer 서브에이전트 1회 호출로 완료 가능한 범위: 생성/수정 파일 5개 이하, 변경 라인 200줄 이하 목표. 초과하면 태스크를 더 분해한다)
   - 명확한 입력(읽을 것)과 출력(만들 것) 보유
   - 명시적 파일 범위 (생성/수정할 파일)
   - 역할 할당: Developer, Reviewer, 또는 QA
   - 우선순위: P0 (핵심 경로), P1 (중요), P2 (있으면 좋음)
4. 태스크 간 의존성 식별 (어떤 태스크가 다른 태스크를 블록하는지)
5. 병렬 실행 가능한 태스크 식별 (상호 의존성 없음)

## Phase 4: 아티팩트 저장 및 보드 업데이트

1. 피처명에서 slug 생성 (소문자, 하이픈, 특수문자 없음). 예: "사용자 인증" → "user-auth"

2. PRD를 `.crew/artifacts/prd/[slug]-prd.md`에 저장

3. 기술 설계를 `.crew/artifacts/design/[slug]-design.md`에 저장 (두 Architect 결과 통합)

4. `.crew/config.md` 프론트매터에서 현재 `last_task_id` 읽기

5. `.crew/board.md` 업데이트: 각 태스크를 `## Backlog` 섹션에 다음 형식으로 추가:

```markdown
### TASK-[NNN]: [태스크 제목]
- **Role**: Developer | Reviewer | QA
- **Priority**: P0 | P1 | P2
- **Depends on**: TASK-[NNN] | none
- **Feature**: [slug]
- **Files**: [생성/수정할 파일 목록]
- **Description**: [1-2문장 설명]
- **Acceptance criteria**: [구체적이고 테스트 가능한 기준]
```

6. `.crew/config.md` 프론트매터의 `last_task_id`를 생성된 가장 높은 태스크 번호로 업데이트

7. `board.md`의 `> Last updated:` 타임스탬프 업데이트

## Phase 5: 사용자에게 계획 제시

간결한 요약을 제시합니다:

```
피처: [name]
PRD: .crew/artifacts/prd/[slug]-prd.md
설계: .crew/artifacts/design/[slug]-design.md

태스크 ([N]개 총):
  [의존성 트리 또는 태스크 관계를 보여주는 정렬된 목록]
  예시:
    TASK-001: [title] (P0, Developer)
    TASK-002: [title] (P0, Developer) - TASK-001에 블록됨
    TASK-003: [title] (P1, Developer) - TASK-001과 병렬 실행 가능
    TASK-004: [title] (P1, Reviewer) - TASK-001, TASK-002, TASK-003에 블록됨
    TASK-005: [title] (P1, QA) - TASK-004에 블록됨

병렬 실행 가능: [N]개 태스크 동시 실행 가능
핵심 경로: TASK-XXX → TASK-XXX → TASK-XXX

개발 시작하려면: /crew:dev [slug]
```

## Phase 6: CLAUDE.md 상태 업데이트

`CLAUDE.md`의 `## Crew 현재 상태` 섹션을 업데이트합니다 (없으면 파일 끝에 추가, 있으면 Edit으로 교체). `.crew/board.md`를 읽어 다음을 포함:
- 마지막 업데이트 타임스탬프
- 진행 중인 작업 (In Progress/In Review 태스크)
- 활성 스프린트 정보
- 이번 실행에서 생성된 아티팩트 경로 (PRD, 설계)
- 다음 명령 제안 (`/crew:dev`, `/crew:sprint plan`)
