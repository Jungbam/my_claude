---
description: 5관점 병렬 리뷰 + 릴리스 게이트 판정 (--aspect 지원: spec/functional/performance/code/uiux/all). 구조적 리뷰·Codex 포함 심층 조사는 `/bams:deep-review`
argument-hint: [파일, 디렉토리, 또는 "pr"] [--aspect <spec|functional|performance|code|uiux|all>[,...]]
---

> **사용 시점**: 코드 변경 후 5관점 병렬 리뷰 + 릴리스 품질 게이트가 필요할 때. deep-review보다 경량.

# Bams Review

Bams 오케스트레이터로서 5개 전문 병렬 qa-strategy 에이전트를 활용한 다관점 코드 리뷰를 실행하고, release-quality-gate 에이전트로 최종 판정합니다.

리뷰 대상: $ARGUMENTS

## 코드 최신화

**`references/preflight-protocol.md` §배치 0(코드 최신화) 참조.** 표준 프로토콜을 따릅니다.

차이점: 없음.

## Aspect 파싱

`references/multi-perspective-review.md` §--aspect 인자 파싱 규칙을 Read하여 그 절차를 따른다 (Pattern A).

- `ASPECT_LIST == ["code"]`(인자 없음)이면 본 섹션 이후 아무 것도 변경되지 않는다 — **이하 Phase 1~8을 기존과 완전히 동일하게 실행**(하위 호환).
- 그 외의 경우, 이후 Phase 2/4에서 `ASPECT_LIST`를 참조한다.

## 리뷰 범위 결정

**$ARGUMENTS가 비어있거나 제공되지 않은 경우:**
1. Bash로 `git diff` 실행하여 미스테이지 변경사항 확인
2. 미스테이지 변경이 없으면, `git diff --cached`로 스테이지된 변경사항 확인
3. 변경사항이 전혀 없으면, 사용자에게 무엇을 리뷰할지 물어보고 중단

**$ARGUMENTS가 파일이나 디렉토리를 지정한 경우:**
- Glob으로 존재 여부 검증, 해당 파일/디렉토리를 리뷰

**$ARGUMENTS가 "pr" 또는 PR 번호인 경우:**
- Bash로 `git diff main...HEAD`를 실행하여 PR diff 획득

**정리/제거 모드 (대상이 diff가 아닌 제거 후보 인벤토리인 경우):**
- dead-code/자산 정리처럼 리뷰 대상이 변경 diff가 아니라 "제거 후보 목록(심볼/파일/자산)"이면, 5관점을 **'제거 안전성 판정'**으로 매핑하여 실행한다:
  - 정확성 = 제거 시 파손(참조 잔존/런타임 파손) 여부
  - 보안 = 무변경 게이트 파일 침범(엔트리포인트·컨벤션 파일·시크릿 경로 제거) 여부
  - 성능 = 제거의 자산/번들 효과
  - 품질 = 제거 후 작업성(가독성·유지보수) 영향
  - 테스트 = 제거 대상에 대한 게이트/스모크 커버리지 존재 여부
- 이 모드에서는 qa-strategy의 `### ★ 정리/제거 모드 분기`(역참조 grep·문자열 리터럴 우선 검증·KEEP 리스트)를 함께 적용한다.

## 사전 조건

`.crew/config.md`가 있으면 읽습니다. `CLAUDE.md`가 있으면 읽습니다.

> 본 커맨드와 deep-review의 차이는 `references/multi-perspective-review.md` §역할 구분 참조.

## Phase 1: 파일 수집

1. 리뷰 범위의 모든 파일 식별
2. 각 파일 읽기 (15개 초과 시 우선순위: 변경된 파일 > 핵심 로직 > 생성/벤더 파일 스킵)
3. git 변경사항 리뷰 시, diff 출력 캡처

> **위임 체계 (Canonical)**: 이 커맨드는 `_shared_common.md` §위임 원칙 + 부록 **루프 B**(Advised)를 따른다. 메인(커맨드)이 qa-strategy(QA부장)를 **직접** Task tool로 spawn하며, pipeline-orchestrator는 조언자(Advisor) 모드로만 호출된다. orchestrator를 경유한 중첩 spawn 금지(harness 깊이 2 제약).

## Phase 2: 5관점 병렬 리뷰 — 루프 B (Advised, QA부장 직접 spawn)

### Phase 2-a. pipeline-orchestrator 조언 요청 (Advisor)

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"** — **조언자 모드**:
<!-- load_profile:exempt non-department-lead spawn -->

> **Review Phase 2 Advisor 호출 — 5관점 리뷰 라우팅 권고**
>
> **컨텍스트:**
> ```
> phase: 2
> slug: {review_timestamp}
> pipeline_type: review
> config: .crew/config.md
> review_files: [Phase 1에서 수집한 파일 목록]
> diff: [git diff 내용 (해당 시)]
> ```
>
> **요청:** 메인이 spawn할 QA부장(qa-strategy) 위임 메시지 템플릿, 5관점(정확성/보안/성능/품질/테스트) specialist 라우팅 권고, 게이트 조건을 Advisor Response로 반환하세요. 직접 spawn 금지(harness 깊이 2 제약).

반환 후 Advisor Response 파싱 + CHAIN_VIOLATION 체크.

### Phase 2-b. 메인이 qa-strategy 직접 spawn (5관점 병렬 리뷰)

`ASPECT_LIST`에 `code`가 포함된 경우에만 실행한다(기본값 `["code"]`이면 항상 포함되어 기존과 동일). `ASPECT_LIST`에 `code`가 없으면 본 Phase를 건너뛰고 Phase 2-c로 진행한다.

Task tool, subagent_type: **"bams-plugin:qa-strategy"** — 메인이 직접 호출:
<!-- load_profile:exempt inherits _shared_common §위임 원칙 -->

> **Review Phase 2 — 5관점 병렬 코드 리뷰**
>
> ```
> task_description: "5관점 병렬 코드 리뷰를 실행하라"
> input_artifacts:
>   - [파일 경로 목록 + 내용 또는 diff]
>   - CLAUDE.md
>   - .crew/config.md
> expected_output:
>   type: multi_perspective_review
> quality_criteria:
>   5관점 정의는 `references/multi-perspective-review.md` §code aspect — 5관점 정의 참조.
> ```
>
> QA부장은 도메인 내 관점별 specialist(automation-qa, defect-triage 등)를 **최대 1회** 추가 spawn 가능(harness 깊이 2 한도).

**기대 산출물**: 5관점 리뷰 결과 (관점별 발견 사항 목록)

### Phase 2-c. aspect 확장 라우팅 (ASPECT_LIST에 code 외 항목이 있을 때만)

`ASPECT_LIST`가 `["code"]`이면 본 절을 건너뛴다(§Aspect 파싱과 동일 조건).

그 외의 경우, `ASPECT_LIST`의 각 항목(이미 spawn된 `code`는 제외)에 대해 `references/multi-perspective-review.md` §aspect별 위임 메시지 템플릿을 사용하여 해당 부서장을 **병렬** 직접 spawn한다(§aspect 정의 표의 부서장 컬럼).  
`uiux` aspect는 **항상 `design-director`**로 실행한다(design-director가 본문에서 codex `gpt-6.1-sol`에 위임; Task tool `model` 파라미터에 gpt 모델명을 넣지 않는다). 각 aspect별 부서장 매핑: spec=product-strategy, functional=qa-strategy, performance=product-analytics, uiux=design-director.

**기대 산출물**: aspect별 리뷰 결과(관점별 발견 사항 목록) — Phase 3에서 code aspect 결과와 함께 종합.

## Phase 3: 리뷰 종합

pipeline-orchestrator(QA부장)가 반환한 후, 5관점 리뷰 결과를 종합합니다:

1. 모든 발견 사항 수집
2. **중복 제거**: 같은 파일, 같은 라인, 같은 개념의 이슈 병합
3. **정렬**: Critical -> Major -> Minor 순. 같은 심각도 내에서는 신뢰도 높은 순
4. 심각도별 총 이슈 수 집계
5. (다중 aspect 시) `references/multi-perspective-review.md` §종합/중복 제거 규칙 6번 — aspect 태그 부여

## Phase 4: 릴리스 품질 게이트 — 루프 A (Simple, QA부장 직접 spawn)

Phase 4는 단일 도메인(QA)의 판정 작업이므로 **루프 A**를 따른다. orchestrator 조언을 생략하고 메인이 qa-strategy를 직접 호출한다.

Task tool, subagent_type: **"bams-plugin:qa-strategy"** — 메인이 직접 호출:
<!-- load_profile:exempt inherits _shared_common §위임 원칙 -->

> **Review Phase 4 — 릴리스 품질 게이트**
>
> ```
> task_description: "코드 리뷰 결과를 종합 판정하라"
> input_artifacts:
>   - review_result: [Phase 3 종합 결과 — 심각도별 이슈 수, 상세 이슈 목록]
>   - changed_files: [파일 목록]
>   - .crew/config.md
> expected_output:
>   type: release_gate_verdict
> quality_criteria:
>   판정 기준: **`references/issue-severity.md` §Release Gate 임계값 참조.**
>   차이점: 본 파이프라인 N값 = **2** (기본값 — SSOT §파이프라인별 Override 확인).
>   (다중 aspect 시) `references/issue-severity.md` §aspect별 Override와 worst-case 원칙을 함께 적용.
> ```
>
> QA부장은 도메인 내 release-quality-gate specialist를 **최대 1회** 추가 spawn 가능(harness 깊이 2 한도).

**기대 산출물**: 판정 결과, 근거, 필수 수정 사항, 권장 수정 사항

## Phase 5: 리포트 저장

타임스탬프 slug 생성 (예: `2026-03-31-143052`).

리뷰 리포트를 `.crew/artifacts/review/review-[timestamp].md`에 저장합니다:
- **요약**: 심각도별 이슈 건수, 릴리스 게이트 판정
- **Critical/Major/Minor 이슈**: 각 이슈 상세 (카테고리, file:line, 설명, 수정안)
- **릴리스 게이트 판정**: PASS/CONDITIONAL/FAIL + 근거
- **긍정적 관찰**: 잘된 점

## Phase 6: 결과 제시

사용자에게 결과를 표시합니다:

```
코드 리뷰 완료
══════════════════════════════════════
리뷰 범위: [파일/디렉토리/PR]
리포트: .crew/artifacts/review/review-[timestamp].md

이슈 요약:
  Critical: [N]건
  Major:    [N]건
  Minor:    [N]건

릴리스 게이트: [PASS/CONDITIONAL/FAIL]
```

그 다음 모든 Critical 및 Major 이슈를 상세와 함께 나열합니다.

## Phase 7: 이슈 수정 제안

Critical 또는 Major 이슈가 있으면, **AskUserQuestion** (multiSelect: true)으로 수정할 이슈를 선택받습니다.

선택된 이슈들에 대해:
1. **CLAUDE.md §4 라우팅 표에 따라 담당 부서장에게 배치 위임하여 수정한다(메인은 Edit/Write로 소스를 직접 수정하지 않는다).**
2. 수정된 이슈를 리포트에서 `[수정됨]` 태그 추가
3. 수정 완료 후 요약 표시

git 저장소인 경우, 수정 후 `git diff --stat` 표시하고 적용/되돌리기 확인.

## Phase 8: 파이프라인 종료

> **CLAUDE.md 자동 편집 금지** — 상태 기록은 `.crew/board.md`(태스크) / `.crew/history.md`(파이프라인 히스토리) / `.crew/artifacts/`(산출물)에 위임. 본 파이프라인은 CLAUDE.md를 수정하지 않는다.

완료 시 `.crew/history.md`에 1줄 기록합니다:
`YYYY-MM-DD | {slug} | review | {완료|실패} | {한 줄 요약}`

## 회고 연결

완료 후 `references/completion-protocol.md`에 따라 `/bams:retro {slug}` 실행 여부를 확인한다 (CLAUDE.md §5 회고 의무). 스팸 방지 조건(소요 10분 미만 + 변경 없음/경량 파이프라인) 충족 시 자동 생략.
