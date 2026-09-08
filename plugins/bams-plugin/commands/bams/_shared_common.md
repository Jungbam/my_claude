# 공통 규칙 (모든 파이프라인 공유)

> 이 파일은 모든 `/bams:*` 파이프라인에서 공유하는 공통 규칙을 정의합니다.
> 각 파이프라인의 `_common.md`에서 이 파일을 Read하여 로드합니다.

---

## ★ 위임 원칙 — 2단 위임 + Orchestrator 조언자 모드 (Canonical)

**이 커맨드에서 직접 Edit/Write로 코드를 수정하지 않는다.**
모든 코드 수정은 `커맨드 → 부서장 → (선택적) 도메인 specialist` **2단 위임 체계**를 통해 수행한다.

```
사용자 커맨드(메인 대화) → 부서장 → (선택적) 도메인 specialist
                       ↑
                  pipeline-orchestrator는 계획/게이트 판정만 반환하는
                  "조언자(Advisor)" 모드로 동작 — 직접 spawn하지 않음
```

### 배경 — harness 제약
Claude Code harness에서 서브에이전트는 또 다른 서브에이전트를 Task tool로 중첩 spawn할 수 없다(깊이 2까지만 허용). 따라서 기존 3단 위임(`orchestrator → 부서장 → 에이전트`)은 구조적으로 실행 불가이며, **2단 위임 + orchestrator 조언자 모드**가 canonical이다.

### 오케스트레이션 루프 (표준)
1. **(선택) orchestrator 조언 요청**: 커맨드가 Task tool로 `pipeline-orchestrator`를 **1회** 호출하여 Advisor Response(Phase 계획 / 부서장 라우팅 / 게이트 조건 / 롤백 권고)를 수신한다. orchestrator는 부서장을 직접 spawn하지 않는다.
2. **부서장 직접 spawn**: 커맨드가 Advisor Response를 파싱하여 권고된 부서장을 **메인 대화에서 직접** Task tool로 호출한다. 병렬 트랙은 단일 메시지에 복수 Task 호출로 처리.
3. **부서장 내부 specialist (선택)**: 부서장은 자신의 도메인 내에서 specialist를 최대 1회 추가 spawn 가능(harness 깊이 2 한도).

### 허용 / 금지
- 허용: Bash, Glob, Grep, Read로 상태 확인 / 사용자 질문(AskUserQuestion) / orchestrator 조언 호출 1회
- 허용: 커맨드 메인 대화에서 Task tool로 부서장을 **직접** spawn
- 금지: 메인 대화가 Edit/Write로 소스 코드 직접 변경
- 금지: orchestrator(서브에이전트) 내부에서 Task tool을 중첩 호출하여 부서장을 spawn하는 시도 — harness 제약
- 금지: "내가 직접 하면 더 빠르다"는 판단으로 부서장 위임을 건너뛰는 행위

### CHAIN_VIOLATION 처리
- orchestrator가 응답 상단에 **"CHAIN_VIOLATION"** 경고를 반환하면: 즉시 해당 Phase를 중단하고 메인(커맨드) 대화로 에스컬레이션한다. 재시도 금지.
- 메인이 부서장 spawn을 건너뛰고 직접 Edit/Write를 시도한 정황 감지 시도 동일하게 중단 + 에스컬레이션.

---

## ★ 파이프라인 완료 기록 (상태 판별의 SSOT)

모든 파이프라인 커맨드는 마무리 단계에서 `.crew/history.md`에 완료 1줄을 기록한다. **파이프라인 상태(진행 중 / 완료 / 실패)의 단일 진실 소스(SSOT)는 `.crew/history.md`이다** — history.md에 완료 기록이 있으면 완료, 없으면 진행 중으로 판별한다.

### 기록 형식
파이프라인 마무리 시 `.crew/history.md`에 아래 블록을 append한다(기존 history.md 형식 유지):

```
## YYYY-MM-DD | {slug} | {STATUS}
- type: {command}
- status: {완료|실패|중단}
- 산출물: {산출물 경로 목록 또는 없음}
- 요약: {한 줄 요약}
```

- `{STATUS}`: `완료` / `실패` / `중단` 중 하나 (헤더에 대문자/한글 상태 표기).
- 태스크 단위 상태는 `.crew/board.md`, 파이프라인 이력은 `.crew/history.md`로 이원화한다.
- 회고는 이 history.md + 대상 산출물 파일 + 사용자 관찰만 입력으로 사용한다(별도 정량 이벤트 없음).

---

## 스킬 로딩

```bash
_BROWSE_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/browse/SKILL.md" 2>/dev/null | head -1)
_QA_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/qa-only/SKILL.md" 2>/dev/null | head -1)
_BENCHMARK_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/benchmark/SKILL.md" 2>/dev/null | head -1)
_CSO_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/cso/SKILL.md" 2>/dev/null | head -1)
_SHIP_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/ship/SKILL.md" 2>/dev/null | head -1)
_DEPLOY_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/land-and-deploy/SKILL.md" 2>/dev/null | head -1)
_DOCRELEASE_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/document-release/SKILL.md" 2>/dev/null | head -1)
_RETRO_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/retro/SKILL.md" 2>/dev/null | head -1)
```

`_BROWSE_SKILL`이 비어있으면 bams-plugin 스킬 미설치로 판단. 해당 단계를 대체 행동으로 처리합니다.

---

## ★ dev-hotfix 모드 (멀티이슈 배치 수정)

`/bams:hotfix`에서 4건 이상의 이슈가 감지되어 dev 파이프라인으로 전환된 경우에 적용됩니다.

### 진입 조건
- hotfix preflight Step 0.55에서 "배치 dev" 선택
- 또는 `/bams:dev`에 직접 멀티이슈 목록 전달 시 자동 감지

### 라우팅 규칙
1. Phase 0(초기화): `dev/phase-0-init.md` 실행 (기존 동일)
2. **Phase 0.8~0.95**: `dev/mode-hotfix-init.md` 실행 (이슈 파싱 + 배치 분할)
3. Phase 1(기획): **생략** — 이슈가 이미 정의되어 있으므로 PRD 불필요
4. Phase 1.5(Git): `dev/phase-1-5-git.md` 실행 (브랜치 생성)
5. Phase 2(구현): `dev/phase-2-implementation.md` 실행 (배치별 순차 실행)
6. Phase 2.5~4: 기존 dev 흐름 동일

### 배치 검증 규칙
- 각 배치 완료 후: `bun run build && bun run typecheck` 중간 검증
- 중간 검증 실패 시: 해당 배치만 롤백, 이전 배치 유지
- 전체 배치 완료 후: Phase 2.5 풀 테스트

### 네이밍 규칙
- slug: `dev_{요약}` (일반 dev와 동일 형식)
- pipeline_type: `dev-hotfix`
- 배치 계획: `.crew/artifacts/report/{slug}-batch-plan.md`

### context rot 방지
- 배치당 최대 4건으로 제한
- 5배치 이상 시 배치 3 완료 후 `/compact` 제안 (completion-protocol Step 4.9 적용)
- 각 배치 완료 시점이 자연스러운 compact 포인트

---

## 부록: 표준 2단 오케스트레이션 루프 템플릿 (하위 커맨드 참조용)

모든 `/bams:*` 커맨드는 아래 루프 중 하나를 따른다. `커맨드 → 부서장` 2단이 기본이며, orchestrator 조언은 복잡도에 따라 선택한다.

### 루프 A — Simple (단일 도메인 / 복잡도 낮음)
orchestrator 조언을 생략하고 커맨드가 부서장을 직접 spawn한다.

```
1. Task tool → 부서장 1회 직접 호출
2. 부서장 결과 수신 및 요약
```

### 루프 B — Advised (다부서 / 복잡도 높음 / Phase 게이트 필요)
orchestrator를 조언자로 1회 호출하여 Advisor Response를 수신한 뒤, 커맨드가 권고된 부서장을 직접 spawn한다.

```
1. Task tool → pipeline-orchestrator 1회 호출 (조언 요청)
2. Advisor Response 파싱 → 부서장 라우팅 / 게이트 조건 추출
3. CHAIN_VIOLATION 체크 → 발견 시 즉시 중단 + 메인 에스컬레이션
4. Task tool 병렬 호출 → 권고된 부서장들 직접 spawn (단일 메시지 복수 Task)
5. 부서장 결과 수신 및 게이트 판정
```

### 공통 규칙
- orchestrator는 Advisor 역할만 수행. 서브에이전트 내부에서 부서장을 spawn하지 않는다(harness 깊이 2 제약).
- 부서장은 자신의 도메인 내 specialist를 최대 1회 추가 spawn 가능.
- 병렬 트랙은 단일 메시지에 복수 Task 호출로 처리한다.

---

## Commit 분리 정책

### 원칙
PR이 squash 머지 시:
- 머지 전 branch는 카테고리/F-R 그룹별로 commit 분리
- 각 commit은 단일 카테고리(C1=A / C2=B / ...) 또는 단일 hunk 그룹 한정
- squash 후 PR description에 "Commit Map" 섹션으로 boundary 명시

### Commit Map 템플릿
```
## Commit Map (squash 시 boundary)
- C1 (Category A): {핵심 변경 요약}
- C2 (Category B): ...
```

### Revert candidates
각 commit message footer에:
```
Revert-Safe: yes | partial | no
```
- `yes`: 단독 revert로 회귀 없음
- `partial`: 다른 commit과 함께 revert 필요
- `no`: revert 시 main 깨짐 (의존성 있음)

### Squash 시 보전
squash 머지하면 4-6 commits이 1 commit으로 합쳐짐. boundary 추적 불가능 → PR description에 Commit Map 명시 의무.
