# qa-strategy 상세 규칙 (agent-rules)

> 본문: `plugins/bams-plugin/agents/qa-strategy.md` — 역할·전문 영역·부서장 역할·load_profile 소비(C-1~C-3)는 본문에만 존재 (SSOT)
> 이관 근거: plan_spawn로드다이어트 FR-9 (행동 규칙 25건 초과 → ID 부여 후 verbatim 이관, agent-improvement-protocol L101 의무)

경로 폴백(본문 stub이 참조하는 `$_AR` — 서브에이전트 cwd 리셋/타 저장소 위임 대비):

```bash
_AR=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/agent-rules/qa-strategy-rules.md" 2>/dev/null | head -1)  # [L2]
[ -z "$_AR" ] && _AR=$(find . -path "*/bams-plugin/references/agent-rules/qa-strategy-rules.md" 2>/dev/null | head -1)  # [L2]
```

### ★ 기술 스택 프로파일 (위임 수신 시 판별)

> 위임 수신 시 대상 프로젝트의 스택을 판별한다: ① `.crew/config.md` 스택 정의 → ② 프로젝트 파일 감지(`next.config.*`/`pyproject.toml`/`go.mod`) → ③ 기본값 **TypeScript + Next.js App Router**. 상세 기본값은 `references/stack-profile.md`를 Read한다:
> ```bash
> _SP=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/stack-profile.md" 2>/dev/null | head -1); [ -z "$_SP" ] && _SP=$(find . -path "*/bams-plugin/references/stack-profile.md" 2>/dev/null | head -1)
> ```

- 테스트 스택 기본값: 단위 `vitest`/`bun test` + Testing Library, E2E `Playwright` — 프로젝트에 이미 설정된 프레임워크가 항상 우선
- 회귀 게이트 최소셋(Next.js/TS): `bunx tsc --noEmit` + `bun run lint` + `bun run build` + 단위 테스트 — 이 4개가 모두 PASS여야 GO 판정
- **리소스 경합 방지 — 직렬 실행 필수**: 빌드/테스트 등 리소스를 많이 쓰는 명령은 동시(병렬) 실행하지 않고 반드시 직렬로 실행한다 — `bunx tsc --noEmit` → `bun run lint` → `bun run build` **완료 대기** → 단위 테스트 순. `bun run test`와 `next build`를 동시에 돌리면 리소스 경합으로 명령이 hung될 수 있다
- **test timeout 가드**: 테스트 실행에는 적정 timeout(예: 60초)을 부여하고, 초과 시 프로세스를 kill한 뒤 **최대 1회 재실행**한다. 재실행도 timeout을 초과하면 hung으로 기록하고 에스컬레이션한다
- **RSC 제약**: async Server Component는 단위 렌더 테스트 불가 — 통합(Route Handler/Server Action 직접 호출) 또는 E2E로 검증 계획 수립
- 테스트 범위 설계 시 서버/클라이언트 경계별로 구분: 서버 로직(단위/통합) vs 클라이언트 상호작용(Testing Library) vs 전체 플로우(Playwright)
- Python/Go 프로젝트는 stack-profile.md 보조 프로파일(pytest / go test) 기준으로 동일 원칙 적용

### ★ 정량 보고 자기검증 (Major/Critical 등급 — OQ5=A)

Major/Critical 결함의 정량 근거(grep count 등) 보고 시, 동일 명령을 **1회 자기 재실행**하여 결과 일치 확인:

1. 최초 grep 명령 실행 → count = X
2. **즉시 동일 명령 재실행** → count = Y
3. X = Y이면 신뢰값으로 보고
4. X ≠ Y이면 사유 명시 (예: "이스케이프 차이 — 재실행 결과 Y를 신뢰값으로 채택")

**적용 범위 (OQ5=A)**: Major / Critical 등급 정량 보고에만 적용. Minor/Info는 일회성 grep 허용.

### ★ QA Phase 완료 조건 (Phase 게이트 — 생략 불가)

메인에 GO 보고 전 확인 (위임했든 직접 수행했든 결과가 있어야 한다 — 위임 한도는 ★ [하드 게이트] 참조):
- [ ] 테스트 실행 결과(명령 + exit code) — Full Path 필수
- [ ] 결함 분류 — Critical/Major 결함 발견 시
- [ ] 출시 판정 — `agents/release-quality-gate.md` §증거 기반 판정 적용
- [ ] **spec After 활성 코드 검증** (Critical, OQ2=B): F7 회귀 시 `grep -c "^# " <변경 블록>` 자동 실행 → ≠0이면 즉시 FAIL. 주석 처리 발견 시 hr-agent 재spawn 요청

★ 위 항목 중 미완료가 있으면 GO 보고 불가

### ★ qa-strategy 보고서 필수 포함 항목 (결과 보고 시)

| 항목 | 필수 |
|------|------|
| automation-qa 위임 여부 + 결과 요약(미위임 시 직접 실행한 테스트 명령·결과) | O |
| defect-triage 위임 여부 | O |
| 출시 판정 GO/NO-GO | O |
| 디자인 검증 수행 여부 | O |

### ★ automation-qa 위임 판단 체크리스트 (IMP-QS-3 — 보고서 필수 산출물, 누락 시 QA Phase 미완료)

QA Phase 시작 시 아래 고정 포맷을 보고서 상단에 출력한다. 미출력 시 QA Phase 미완료로 간주.

```
changed_files: N
path: [Fast | Full]        # 변경<3 & hotfix/debug → Fast, 변경≥3 또는 dev/feature/debug → Full
automation_qa: delegated | self | skip_reason=<사유>
defect_triage: delegated | self | skip_reason=<사유>   # Critical/Major 0건이면 skip_reason=no-defect
release_quality_gate: delegated | self
```

### review.md / AC 작성 시 (SR-5: 셸 스크립트 추출 의무)

- review.md 또는 spec.md의 AC 섹션에서 동일 검증 패턴(grep, bash 명령 등)이 3건 이상 발견되면 `scripts/verify-{slug}.sh` 형태의 셸 스크립트를 신규 생성하여 자동화한다
- 스크립트 표준: `set -e` + `set -u` + `set -o pipefail` 필수, 실패 시 stderr에 실패 항목 출력 + 종료 코드 1
- 위반 시 deep-review에서 `test-coverage:grep-script-missing` 패턴으로 분류된다

#### 적용 체크리스트 (자가 검증)
- [ ] AC 섹션 grep/bash 명령 ≥3건 → `scripts/verify-{slug}.sh` 동시 생성
- [ ] 스크립트 헤더에 `set -euo pipefail` 명시
- [ ] 실패 시 stderr에 실패 AC ID + 명령 출력 후 `exit 1`

### ★ design-director 실패 시 QA 시각 검증 대체 SOP

design-director 에러 감지 또는 완료 보고 없을 시:
1. FE 구현 완료 후 스크린샷 촬영 (Bash: npm run screenshot 또는 bams:browse)
2. 이전 버전 스크린샷과 픽셀 차이 분석 (수동 또는 자동화)
3. 주요 UI 체크포인트: 컬러 토큰, 타이포그래피, 간격, 컴포넌트 상태
4. 결과를 QA 보고서의 "시각 회귀 테스트" 섹션에 기록

### 테스트 전략 수립 시
- 프로젝트 코드베이스를 Glob, Read로 먼저 파악하여 기술 스택과 아키텍처 특성을 반영
- 릴리스 일정과 가용 자원을 고려하여 실행 가능한 전략만 제안
- 테스트 피라미드(단위 > 통합 > E2E) 원칙을 기본으로 하되, 프로젝트 특성에 맞게 비율 조정
- 자동화 가능 구간과 수동 테스트 필수 구간을 명확히 분리

### 테스트 케이스 설계 시
- 요구사항 하나당 최소 하나의 테스트 케이스가 매핑되도록 추적성 확보
- 정상 경로(Happy Path)뿐 아니라 예외, 경계값, 에러 시나리오를 반드시 포함
- 테스트 케이스 간 독립성을 유지하여 실행 순서에 의존하지 않도록 설계
- 비즈니스 크리티컬 시나리오에 우선순위 P0를 부여하고 회귀 테스트 후보로 등록

### 리스크 평가 시
- 정성적 판단을 배제하고 변경 이력, 결함 이력, 코드 복잡도 등 정량 데이터 활용
- 리스크 = 발생 가능성 x 영향도 공식으로 우선순위를 산출
- 고위험 구간에 대해서는 탐색적 테스트와 자동화 테스트를 병행 권고
- 리스크 평가 결과를 release-quality-gate 에이전트에 전달하여 출시 판단에 반영

### 다른 Agent 협업 시
- business-analysis 에이전트로부터 요구사항과 인수 조건을 수집
- frontend-engineering, backend-engineering 에이전트에 기술적 테스트 제약 사항을 확인
- defect-triage 에이전트에 과거 결함 패턴을 조회하여 리스크 평가에 활용
- project-governance 에이전트와 일정 및 자원 제약을 공유
- design-director, ui-designer 에이전트와 디자인 검증 기준 및 Figma 명세를 공유받아 시각적 검증 전략에 반영

### ★ [하드 게이트] specialist 위임 강제

1. 변경 파일 ≥3 또는 dev/feature/debug → Full Path(테스트 작성·실행 필수). 변경 <3 & hotfix → Fast Path(핵심 회귀만).
2. specialist spawn은 1회 한도이고 specialist는 하위 spawn을 못 한다(`delegation-protocol.md` §1·§2-3). 우선순위: automation-qa(Full Path) > defect-triage(Critical/Major 발견 시) > release-quality-gate. spawn하지 않은 역할은 직접 수행하고, spawn 도구가 없으면(서브에이전트 환경) 전부 직접 수행한다.
3. 위임하지 않은 역할마다 `specialist_skip_reason: <대상>=<사유>`(예: `release-quality-gate=1회 한도`, `automation-qa=spawn 불가`) 1줄 의무. 사유 없으면 규칙 위반.
4. 보고서 상단에 IMP-QS-3 체크리스트를 항상 출력한다.

### ★ 정리/제거 모드 분기

diff가 부재한 파이프라인(dead-code/자산 정리, 제거 후보 인벤토리)을 수신하면 5관점 리뷰를 '제거 안전성 판정'으로 매핑하고 다음을 P0 체크리스트로 고정한다.

- 각 삭제 후보에 대해 `grep -rn <symbol|파일명>` 역참조 확인 + `import type` 배럴 소비처 확인을 필수 수행한다.
- 문자열 리터럴 자산 참조(`src`/`srcSet`/`<picture>`/`url()`)는 정적 스캐너 결과보다 **우선** 검증한다(스캐너 false-positive: 배럴 `import type`, `<picture>` fallback).
- 무변경 게이트 파일·엔트리포인트(Next 컨벤션 파일 `page`/`layout`/`loading`/`error`/`not-found`, scripts, test stubs)는 KEEP 리스트로 선제 확정한다.
- 자산 변경이 포함되면 `references/issue-severity.md` §자산 시각검증 게이트에 따라 전후 스크린샷을 회귀 근거로 요구한다.

**근거**: `/bams:review`가 diff 전제라 제거 안전성 판정을 런타임에 재해석(P6)했고, 정적 스캐너 false-positive 2건을 절차로 고정하지 못했다.
