---
description: 스프린트 플래닝, 관리, 진행 상황 추적
argument-hint: <plan|status|close>
---

# Bams Sprint

Bams 오케스트레이터로서 스프린트 운영을 관리합니다.

액션: $ARGUMENTS

$ARGUMENTS가 비어있으면, 아래 도움말 섹션을 표시하고 중단합니다.

## 코드 최신화

**`references/preflight-protocol.md` §배치 0(코드 최신화) 참조.** 표준 프로토콜을 따릅니다.

차이점: 없음.

## 사전 조건

Glob으로 `.crew/config.md`가 존재하는지 확인합니다. 없으면:
- 출력: "프로젝트가 초기화되지 않았습니다. `/bams:init`을 실행하여 설정하세요."
- 여기서 중단.

`.crew/config.md`와 `.crew/board.md`(활성 섹션만 — Backlog/In Progress/In Review)를 읽습니다.

Glob으로 `.crew/sprints/sprint-*.md`를 찾아 기존 스프린트를 확인합니다. 활성 스프린트는 YAML 프론트매터에 `completed: null`이 있습니다.

> **위임 체계 (Canonical)**: 이 커맨드는 `_shared_common.md` §위임 원칙 + 부록 **루프 A**(Simple, 단일 도메인)를 따른다. 메인(커맨드)이 project-governance(기획부 소속)를 **직접** Task tool로 spawn한다. orchestrator를 경유한 중첩 spawn 금지(harness 깊이 2 제약).

## 액션별 라우팅

---

### 액션: "plan" 또는 "start"

**1. 활성 스프린트 확인:**
활성 스프린트가 있으면 사용자에게 알림: "스프린트 [N]이 활성 상태입니다. `/bams:sprint close`로 먼저 종료하세요." 중단.

**2. 백로그 확인:**
board.md의 `## Backlog`에 있는 태스크 수를 셉니다. 0이면:
- 출력: "백로그에 태스크가 없습니다. `/bams:plan <feature>`로 먼저 태스크를 생성하세요."
- 중단.

**3. project-governance 에이전트로 스프린트 플래닝:**

서브에이전트 실행 (Task tool, subagent_type: **"bams-plugin:project-governance"**):

> **스프린트 플래닝 모드**로 백로그 태스크를 분석하고 스프린트 구성을 제안합니다.
>
> **백로그 태스크**: [board.md의 Backlog 섹션 삽입]
> **프로젝트 컨텍스트**: [config.md 삽입]
> **이전 스프린트**: [있으면 velocity 정보 삽입]
>
> 분석:
> 1. 태스크 우선순위와 의존성 기반 최적 순서
> 2. 예상 작업량 기반 스프린트 범위 제안
> 3. 리스크 요소 식별

모든 백로그 태스크를 테이블로 사용자에게 표시합니다.

사용자에게 질문: "이 스프린트에 어떤 태스크를 포함할까요? (all / P0만 / P0+P1 / 특정 ID 나열)"

스프린트 목표도 물어봅니다 (한 문장).

**4. 스프린트 파일 생성:**

`.crew/sprints/sprint-[NNN].md` 작성 (NNN은 3자리 zero-padded, YAML 프론트매터 포함).

**5. 보드 업데이트:**
선택된 태스크를 board.md의 `## Backlog`에서 `## In Progress`로 이동합니다.

---

### 액션: "status"

> 프로젝트 대시보드/보드 요약 기능을 이 서브커맨드가 흡수한다 (별도 대시보드 커맨드 없음).

**0. board.md 요약 (항상 실행 — 대시보드 대체):**

`.crew/board.md`를 파싱하여 섹션별 태스크 수를 집계해 표시한다. 활성 스프린트가 없어도 이 요약은 제공한다.

```bash
_BOARD=".crew/board.md"
if [ -f "$_BOARD" ]; then
  echo "=== Board 요약 ==="
  for _S in Backlog "In Progress" "In Review" Done; do
    _CNT=$(awk -v sec="## $_S" '
      $0 ~ /^## / { inb = ($0 == sec) }
      inb && /^### TASK-/ { c++ }
      END { print c+0 }' "$_BOARD")
    printf "  %-12s %s\n" "$_S" "$_CNT"
  done
  echo "  최신 업데이트: $(grep -m1 '^> Last updated:' "$_BOARD" | sed 's/^> Last updated: *//')"
else
  echo "board.md 없음 — /bams:plan 으로 태스크를 먼저 생성하세요."
fi
```

**1. 활성 스프린트 찾기.** 없으면 위 board.md 요약만 표시하고 종료.

**2. project-governance 에이전트로 상태 분석:**

서브에이전트 실행 (Task tool, subagent_type: **"bams-plugin:project-governance"**):

> **스프린트 상태 분석 모드**
> **스프린트 파일**: [활성 스프린트 내용]
> **board.md**: [보드 내용]
>
> 분석: 진행률, 병목, 위험 요소, 다음 추천 태스크

**3. 메트릭 계산 및 표시:**

```
스프린트 [N] 현황
══════════════════════════════════════
목표: [goal]
진행률: [completed]/[total] 태스크 ([percentage]%)
[████████░░░░░░░░░░░░] 40%

완료됨:     ✓ TASK-001: [title]
리뷰 중:    @ TASK-004: [title]
진행 중:    > TASK-002: [title]
블록됨:     x TASK-005: [title] (TASK-002 대기 중)
```

---

### 액션: "close"

**1. 활성 스프린트 찾기.** 없으면 안내 후 중단.

**2. 최종 메트릭 계산** (완료/미완료 태스크, velocity, 기간).

**3. 스프린트 파일 업데이트** (completed 타임스탬프 설정).

**4. 완료 태스크 아카이브:** board.md `## Done` -> `.crew/history.md`.

**5. 미완료 태스크를 `## Backlog`으로 되돌리기.**

**6. 회고 표시:**

```
스프린트 [N] 종료
══════════════════════════════════════
기간: [N]일
완료됨: [N]/[total] 태스크
Velocity: [N] 태스크/스프린트

다음: /bams:sprint plan으로 새 스프린트 시작
```

---

### 액션: 기타 또는 "help"

```
Bams 스프린트 커맨드
══════════════════════════════════════
  /bams:sprint plan     스프린트 플래닝 및 시작
  /bams:sprint status   현재 스프린트 진행 상황 확인
  /bams:sprint close    회고와 함께 스프린트 종료
```

## 회고 연결

완료 후 `references/completion-protocol.md`에 따라 `/bams:retro {slug}` 실행 여부를 확인한다 (CLAUDE.md §5 회고 의무). 스팸 방지 조건(소요 10분 미만 + 변경 없음/경량 파이프라인) 충족 시 자동 생략.
