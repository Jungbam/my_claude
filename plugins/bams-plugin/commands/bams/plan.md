---
description: PRD + 기술 설계 + 태스크 분해 (구현 없이 문서만)
argument-hint: <피처 또는 이슈 설명>
---

# Bams Plan

Bams 오케스트레이터로서 product-strategy, business-analysis, design-director, frontend/backend-engineering 에이전트를 활용한 플래닝 워크플로를 실행합니다. FE/디자인 설계는 Codex가 작성하고, 결과물은 Codex 리뷰 게이트(gpt-6.1-sol)를 통과시킵니다.

기획할 피처/이슈: $ARGUMENTS

$ARGUMENTS가 비어있으면, 사용자에게 어떤 피처를 기획할지 물어보고 중단합니다.

## 코드 최신화

**`references/preflight-protocol.md` §배치 0(코드 최신화) 참조.** 표준 프로토콜을 따릅니다.

차이점: 없음.

## 사전 조건

Glob으로 `.crew/config.md`가 존재하는지 확인합니다. 없으면:
- 출력: "프로젝트가 초기화되지 않았습니다. `/bams:init`을 실행하여 설정하세요."
- 여기서 중단.

`.crew/config.md`와 `.crew/board.md`(활성 섹션만 — Backlog/In Progress/In Review)를 읽어 현재 상태를 파악합니다. Done·과거 완료분은 `.crew/board-archive.md`에 분리되어 있어 읽지 않습니다.

> **위임 체계 (Canonical)**: 이 커맨드는 `_shared_common.md` §위임 원칙 + 부록 **루프 B**(Advised)를 따른다. 메인(커맨드)이 부서장을 **직접** Task tool로 spawn하며, pipeline-orchestrator는 조언자(Advisor) 모드로 1회만 호출된다. orchestrator를 경유한 중첩 spawn 금지(harness 깊이 2 제약).

**공통 규칙 로드**: 반드시 `plugins/bams-plugin/commands/bams/_shared_common.md`를 Read합니다.

## Phase 1: PRD 작성 — 루프 A (Simple, 단일 부서장 직접 spawn)

Phase 1은 단일 도메인(기획)이므로 **루프 A**를 따른다. orchestrator 조언을 생략하고 메인이 product-strategy(기획부장)를 직접 호출한다.

Task tool, subagent_type: **"bams-plugin:product-strategy"** — 메인이 직접 호출:

> **기획 Phase 1 — PRD 작성**
>
> ```
> task_description: "피처 요청을 분석하고 구조화된 PRD를 작성하라"
> input_artifacts:
>   - .crew/config.md
>   - feature_description: {$ARGUMENTS}
> expected_output:
>   type: prd_document
>   paths: [.crew/artifacts/prd/{slug}-prd.md]
> quality_criteria:
>   - 문제 정의 및 목표 명확
>   - 사용자 스토리 / 유스케이스 포함
>   - 기능 요구사항 (필수/선택) 구분
>   - 비기능 요구사항 (성능, 보안, 접근성) 포함
>   - 인수 기준 (테스트 가능한 구체적 기준) 정의
>   - 미결 질문 명시
> ```
>
> load_profile: { level: L2, refs: [{doc: config, section: "§아키텍처,§컨벤션"}, {doc: agent-rules, agent: product-strategy}] }
>
> 기획부장은 도메인 내 business-analysis / ux-research specialist를 **최대 1회** 추가 spawn 가능(harness 깊이 2 한도).
>
> **미결 질문이 있으면** 반드시 보고하세요.

반환 후 결과를 확인합니다:
- **성공 시**: 완료로 기록하고 Phase 2로 진행.
- **에러 시**: 사용자에게 에러를 보고하고, 계속 진행할지 중단할지 AskUserQuestion으로 확인. 중단 선택 시 파이프라인 상태를 failed로 기록 후 Phase 7로 이동.

**미결 질문이 있으면**: 불릿 포인트로 사용자에게 제시합니다. Phase 2로 진행하기 전에 사용자의 답변을 기다렸다가, 답변을 받은 후 PRD에 반영합니다.

## Phase 2: 기능 명세 + 기술 설계 — 루프 B (Advised, 다부서 병렬 직접 spawn)

Phase 2는 기획/개발 **다부서** 병렬 트랙이므로 **루프 B**를 따른다. orchestrator를 Advisor로 1회 호출하여 라우팅/게이트 권고를 받은 뒤, 메인이 권고된 부서장들을 단일 메시지 내 복수 Task 호출로 **직접 병렬 spawn**한다.

### Phase 2-a. pipeline-orchestrator 조언 요청 (Advisor)

Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"** — **조언자 모드**:

<!-- load_profile:exempt non-department-lead spawn -->

> **Plan Phase 2 Advisor 호출 — 기능 명세 + 기술 설계 라우팅 권고**
>
> **컨텍스트:**
> ```
> phase: 2
> slug: {slug}
> pipeline_type: plan
> prd: .crew/artifacts/prd/{slug}-prd.md
> config: .crew/config.md
> ```
>
> **요청:** 메인이 병렬 spawn할 부서장 목록과 위임 메시지 템플릿(기능 명세는 product-strategy, 디자인 기술 설계는 design-director, FE/BE 기술 설계는 frontend-engineering / backend-engineering), 산출물 경로, 게이트 조건을 Advisor Response로 반환하세요. 직접 spawn 금지(harness 깊이 2 제약).

반환 후 Advisor Response 파싱 + CHAIN_VIOLATION 체크:

**CHAIN_VIOLATION 체크**: orchestrator 반환 내용의 첫 줄에 "CHAIN_VIOLATION"이 포함되어 있으면:
- 사용자에게 위반 사항을 보고
- 파이프라인 상태를 failed로 기록
- Phase 7로 즉시 이동하여 종료

정상인 경우 Phase 2-b로 진행.

### Phase 2-b. 메인이 부서장 4트랙 병렬 직접 spawn + gpt-6.1-sol 게이트

**단일 메시지에 4개 Task tool 호출을 동시에 발행하여 메인이 직접 병렬 spawn:**

1. Task tool, subagent_type: **"bams-plugin:product-strategy"**
   > **Plan Phase 2 — 기능 명세**
   > ```
   > task_description: "PRD를 기반으로 상세 기능 명세를 작성하라"
   > input_artifacts: [.crew/artifacts/prd/{slug}-prd.md, .crew/config.md]
   > expected_output: { type: functional_spec, paths: [.crew/artifacts/design/{slug}-spec.md] }
   > quality_criteria:
   >   - 화면/API별 상세 동작 명세 완성
   >   - 데이터 모델 정의
   >   - 상태 전이 다이어그램 (필요 시)
   >   - 에러 시나리오 및 처리 방법
   >   - 외부 시스템 연동 명세
   > ```
   > load_profile: { level: L2, refs: [{doc: config, section: "§아키텍처,§컨벤션"}, {doc: agent-rules, agent: product-strategy}] }
   > 기획부장은 business-analysis specialist를 최대 1회 추가 spawn 가능.

2. Task tool, subagent_type: **"bams-plugin:design-director"**
   > **Plan Phase 2 — 디자인(UI/UX) 기술 설계 (Codex 작업 트랙)**
   > ```
   > task_description: "PRD를 기반으로 UI/UX 기술 설계를 작성하라. 정보구조, 화면 구조, 상태(로딩/에러/빈 상태), 접근성, 디자인 토큰 적용 전략을 포함한다."
   > input_artifacts: [.crew/artifacts/prd/{slug}-prd.md, .crew/config.md]
   > expected_output: { type: technical_design_ui, paths: [.crew/artifacts/design/{slug}-design-ui.md] }
   > quality_criteria:
   >   - 화면 구조/컴포넌트 계층 명확
   >   - 접근성/상태 설계 명시
   >   - 디자인 토큰/스타일 전략 명시
   >   - FE 구현 핸드오프 가능 수준
   > ```
   > load_profile: { level: L2, refs: [{doc: design-artifact-layout, section: "§경계 마커"}, {doc: design-artifact-templates}] }

3. Task tool, subagent_type: **"bams-plugin:frontend-engineering"**
   > **Plan Phase 2 — FE 기술 설계**
   > ```
   > task_description: "PRD와 디자인 설계 입력을 기반으로 프론트엔드 기술 설계를 작성하라 (Codex 작업 트랙)"
   > input_artifacts: [.crew/artifacts/prd/{slug}-prd.md, .crew/config.md]
   > expected_output: { type: technical_design_fe, paths: [.crew/artifacts/design/{slug}-design-fe.md] }
   > quality_criteria:
   >   - 컴포넌트 구조 명확
   >   - 상태 관리/라우팅/스타일링 전략
   >   - 파일 목록
   > ```
   > <!-- load_profile:exempt inherits _shared_common §위임 원칙 -->

4. Task tool, subagent_type: **"bams-plugin:backend-engineering"**
   > **Plan Phase 2 — BE 기술 설계**
   > ```
   > task_description: "PRD를 기반으로 백엔드 기술 설계를 작성하라"
   > input_artifacts: [.crew/artifacts/prd/{slug}-prd.md, .crew/config.md]
   > expected_output: { type: technical_design_be, paths: [.crew/artifacts/design/{slug}-design-be.md] }
   > quality_criteria:
   >   - API 엔드포인트 정의 완료
   >   - DB 스키마 / 비즈니스 로직
   >   - 인증/권한
   >   - 파일 목록
   > ```
   > <!-- load_profile:exempt inherits _shared_common §위임 원칙 -->

4개 반환 후 각 에이전트 결과를 확인합니다. 에러가 있으면 사용자에게 어떤 트랙이 실패했는지 보고하고 계속 진행할지 중단할지 AskUserQuestion으로 확인한다(중단 선택 시 파이프라인 상태를 failed로 기록 후 Phase 7로 이동).

```bash
# gpt-6.1-sol: 디자인/FE 리뷰 게이트
# 목적: FE 설계 + 디자인(UI/UX) 설계를 Codex로 독립 검토 (advisory — 실패해도 Phase는 진행하되 Reviewer 태스크 강제)
_CODEX_REVIEW_PATH=".crew/artifacts/review/{slug}-design-fe-codex-review.md"
_CODEX_TIMEOUT="${_CODEX_TIMEOUT:-600}"   # A. codex hang 방어 (기본 600s). timeout 시 exit 124 → fallback (timeout/gtimeout 부재 시 _to가 perl alarm으로 대체, 만료 exit 142)
_CODEX_MIN_BYTES=200                       # C. 유효 리뷰 최소 크기 — 빈/부분(partial) 출력 거절 임계값
_TO=$(command -v timeout || command -v gtimeout || true)   # macOS: coreutils 없으면 빈 값 → perl alarm 폴백
_to() { if [ -n "$_TO" ]; then "$_TO" "$@"; else perl -e 'alarm shift; exec @ARGV' "$@"; fi; }   # 사용: _to <초> <명령...> — timeout/gtimeout 부재 시 perl alarm(macOS 기본 탑재)으로 hang 방어 유지(만료 시 SIGALRM, exit 142)
_CODEX_OK=0
mkdir -p .crew/artifacts/review

# 실패 모든 경로에서 동일한 "Skipped" 산출물 보장 (부분출력·빈파일·hang이 거짓 리뷰로 남지 않도록)
_write_codex_skip() {
  cat > "$_CODEX_REVIEW_PATH" <<EOF
# Codex Review Skipped
- reason: $1
- action: Phase 3 태스크에 Reviewer 태스크(TODO: Codex FE+UI/UX design review) 필수 추가
EOF
}

if ! command -v codex >/dev/null 2>&1; then
  _write_codex_skip "codex CLI unavailable"
elif ! _to 60 codex exec "ping" -s read-only -c 'model="gpt-6.1-sol"' >/dev/null 2>&1; then
  # D. 인증 ping — command -v 통과 후 인증만료/모델 미가용을 실제 exec 전 사전 감지 (exit code 직접 판정; stdout 유무로 판정하지 않음)
  _write_codex_skip "codex 인증 실패 또는 gpt-6.1-sol 미가용 (auth ping failed)"
else
  # B. exit code 분기 + A. timeout 래퍼로 실제 리뷰 실행
  if _to "$_CODEX_TIMEOUT" codex exec "다음 2개 설계 문서를 함께 리뷰하라: .crew/artifacts/design/{slug}-design-fe.md 와 .crew/artifacts/design/{slug}-design-ui.md. UI 구조, UX 흐름, 상태 관리, 라우팅, 접근성, 토큰/스타일 일관성을 점검하고 Critical/Major/Minor로 분류하라. 결과를 한국어 Markdown으로 출력하라." \
       -s read-only -c 'model="gpt-6.1-sol"' -c 'model_reasoning_effort="high"' --enable web_search_cached \
       > "$_CODEX_REVIEW_PATH" 2>/dev/null; then
    # C. 산출물 비어있음/부분출력 체크 (최소 바이트 임계값 통과 시에만 유효 리뷰로 인정)
    if [ -s "$_CODEX_REVIEW_PATH" ] && [ "$(wc -c < "$_CODEX_REVIEW_PATH")" -ge "$_CODEX_MIN_BYTES" ]; then
      _CODEX_OK=1
    else
      _write_codex_skip "codex 출력 없음/부분출력 (< ${_CODEX_MIN_BYTES}B)"
    fi
  else
    # timeout(exit 124) 또는 codex 비정상 종료 → 부분/손상 출력 덮어쓰기
    _write_codex_skip "codex exec 실패 또는 타임아웃 (exit≠0, timeout=${_CODEX_TIMEOUT}s)"
  fi
fi

# codex는 advisory — 실패/미가용 시에도 4트랙 통과 기준으로 진행하되, fallback 산출물이
#   Reviewer 태스크를 강제하므로 부분·빈 출력이 거짓 GO(false pass)로 남지 않음.
# → codex 검토 결과: $_CODEX_OK (1=독립 검토 완료 / 0=Reviewer 보강 태스크 Phase 3 필수 추가)
```

**기대 산출물**: 기능 명세, 디자인(UI/UX) 기술 설계, FE 기술 설계, BE 기술 설계, Codex FE/디자인 리뷰 리포트 (4트랙 + gpt-6.1-sol)

## Phase 3: 태스크 분해

pipeline-orchestrator가 반환한 Phase 2 결과를 종합하여 구체적인 태스크로 분해합니다:

1. 기능 명세(spec)와 기술 설계(design-ui/design-fe/design-be) 문서 읽기
2. 기능 명세와 기술 설계를 병합
3. 작업을 개별 태스크로 분해. 각 태스크는:
   - 한 세션에서 완료 가능 (생성/수정 파일 5개 이하, 변경 라인 200줄 이하 목표)
   - 명확한 입력(읽을 것)과 출력(만들 것) 보유
   - 명시적 파일 범위
   - 역할 할당: Developer, Reviewer, 또는 QA
   - 우선순위: P0 (핵심 경로), P1 (중요), P2 (있으면 좋음)
4. 태스크 간 의존성 식별
5. 병렬 실행 가능한 태스크 식별
6. `.crew/artifacts/review/{slug}-design-fe-codex-review.md`에서 Critical/Major를 추출해 Reviewer 태스크로 반영

## Phase 4: 아티팩트 저장 및 보드 업데이트

`.crew/board.md`가 존재하지 않으면 기본 템플릿으로 생성합니다:
```markdown
# Task Board

> Last updated: {현재 날짜}

## Backlog

## In Progress

## In Review

## Done
```

1. 피처명에서 slug 생성 (소문자, 하이픈, 특수문자 없음)

2. PRD를 `.crew/artifacts/prd/[slug]-prd.md`에 저장

3. 기술 설계를 `.crew/artifacts/design/[slug]-design.md`에 저장 (기능 명세 + 프론트엔드 설계 + 백엔드 설계 통합)
4. 디자인(UI/UX) 설계를 `.crew/artifacts/design/[slug]-design-ui.md`에 저장
5. Codex FE/디자인 리뷰를 `.crew/artifacts/review/[slug]-design-fe-codex-review.md`에 저장
6. `.crew/board.md`에서 현재 최대 `TASK-NNN` 번호를 확인 (다음 태스크 번호의 기준)

7. `.crew/board.md` 업데이트: 각 태스크를 `## Backlog` 섹션에 다음 형식으로 추가:

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

8. 태스크 번호는 board.md의 최대 `TASK-NNN`에서 이어서 증가시킨다 (board.md가 SSOT)

9. `board.md`의 `> Last updated:` 타임스탬프 업데이트

## Phase 5: 사용자에게 계획 제시

간결한 요약을 제시합니다:

```
피처: [name]
PRD: .crew/artifacts/prd/[slug]-prd.md
설계: .crew/artifacts/design/[slug]-design.md
디자인(UI/UX) 설계: .crew/artifacts/design/[slug]-design-ui.md
Codex FE/디자인 리뷰: .crew/artifacts/review/[slug]-design-fe-codex-review.md

태스크 ([N]개 총):
  [의존성 트리 보여주는 정렬된 목록]
  예시:
    TASK-001: [title] (P0, Developer)
    TASK-002: [title] (P0, Developer) - TASK-001에 블록됨
    TASK-003: [title] (P1, Developer) - TASK-001과 병렬 실행 가능

병렬 실행 가능: [N]개 태스크 동시 실행 가능
핵심 경로: TASK-XXX -> TASK-XXX -> TASK-XXX

개발 시작하려면: /bams:dev [slug]
```

## Phase 6: 상태 기록 위임

> **CLAUDE.md 자동 편집 금지** — 상태 기록은 `.crew/board.md`(태스크) / `.crew/history.md`(파이프라인 히스토리) / `.crew/artifacts/`(산출물)에 위임. 본 파이프라인은 CLAUDE.md를 수정하지 않는다.

## Phase 7: 파이프라인 종료

완료 시 `.crew/history.md`에 1줄 기록합니다(실패 step이 1개라도 있으면 `실패`, 아니면 `완료`):
`YYYY-MM-DD | {slug} | plan | {완료|실패} | {한 줄 요약}`
