# automation-qa 상세 규칙 (agent-rules)

> 본문: `plugins/bams-plugin/agents/automation-qa.md` — 기술 스택 프로파일·전문 영역·stub은 본문에만 존재 (SSOT)
> 이관 근거: plan_spawn로드다이어트 FR-9 (행동 규칙 39건 ID화 후 verbatim 이관)

경로 폴백(본문 stub이 참조하는 `$_AR` — 서브에이전트 cwd 리셋/타 저장소 위임 대비):

```bash
_BAMS=$( { jq -r '[.plugins["bams-plugin@my-claude"] // empty] | flatten | sort_by(.scope != "user") | .[].installPath // empty' ~/.claude/plugins/installed_plugins.json; sh -c 'ls -dt "$HOME"/.claude/plugins/cache/*/bams-plugin/*/'; } 2>/dev/null | while IFS= read -r _p; do [ -d "$_p" ] && [ ! -e "$_p/.orphaned_at" ] && echo "${_p%/}" && break; done || true); _AR="$_BAMS/references/agent-rules/automation-qa-rules.md"; [ -e "$_AR" ] || _AR=""; [ -z "$_AR" ] && _AR=$(find . -path "*/bams-plugin/references/agent-rules/automation-qa-rules.md" 2>/dev/null | head -1)
```

### Full Path 자동 위임 트리거

qa-strategy로부터 위임 수신 시, 아래 체크리스트를 순서대로 확인하고 **결과를 출력**한다:

```
[ ] 1. 변경 파일 수 확인: git diff --name-only | wc -l → N개
[ ] 2. N ≥ 3이면 → Full Path (E2E + API + 회귀 테스트 전체)
[ ] 3. N < 3이면 → Fast Path (핵심 회귀만)
[ ] 4. hotfix 플래그 존재 시 → Fast Path 강제 적용
→ 판정 결과: [Full Path | Fast Path], 근거: [파일 수 N개]
```

**30초 내 위임 미수신 감지:**
qa-strategy QA Phase 진입 이후 30초 내 본 에이전트에 위임이 없으면:
```bash
# pipeline-orchestrator에 "참여 누락 감지" 알림 전송
echo "[automation-qa] QA Phase 위임 미수신 감지 — qa-strategy QA Phase 진입 후 30초 초과. pipeline-orchestrator에 에스컬레이션 필요." >&2
```

### 결과 보고 요약 4항

결과 보고 시 요약은 반드시 다음 4항을 포함한다:

```
테스트수:{N}개 / 커버리지:{N}% / 비주얼회귀:{통과|실패|스킵} / 주요실패:{없음|{테스트명}}
```

누락 항목이 있으면 "N/A"로 명시 — 빈 필드 금지.

### 참여 의무 파이프라인

- feature 파이프라인 Phase 3: **필수 참여** (qa-strategy Phase Gate 조건)
- hotfix 파이프라인: Fast Path 적용, 핵심 회귀 테스트만 실행
- debug 파이프라인: qa-strategy 판단에 따라 선택적 참여
- **review/제거정리 파이프라인**: 테스트 작성 대상이 없더라도 qa-strategy 요청 시 build + start 200 + 삭제 대상 라우트 스모크(+ 자산 변경 시 전후 스크린샷)를 회귀 근거로 제출하고, call_id를 발급받아 RQG의 "회귀 전체 통과" 판정 근거를 공급한다.

qa-strategy로부터 feature Phase 3 위임을 받지 않은 경우, pipeline-orchestrator에게 "QA 참여 누락" 알림 전송.

### QA 감사 스크립트 실행 시

> stub ID: QA-AUDIT-RUN

`/bams:qa --audit`(감사 모드) 위임을 받으면 Step 1 산출물은 테스트 계획이 아니라 **범위 선언(`scope_declaration`)**이다. 이 커맨드에서 automation-qa는 범위 선언만 위임받고, 스크립트 실행과 사용자 승인 질문(doctor exit 3 설치 승인, `project_checks` 승인, 원격 호스트)은 메인(qa-audit 엔진)이 한다 — 서브에이전트는 사용자에게 질문할 수 없기 때문이다.

단독 위임으로 스크립트를 직접 돌리게 된 경우에도 아래 실행 규칙을 지킨다. 사용자 승인이 필요한 단계(설치·`project_checks`·원격 호스트)는 실행하지 말고, 필요한 명령과 사유를 메인에 요청으로 반환한다. 스크립트는 관찰 전용이다 — 결과는 후보이며 결함 확정·판정은 `references/qa-principles.md` §3과 `references/issue-severity.md` §QA 판정 매핑을 따른다.

**경로**: Bash 호출마다 셸 상태가 초기화되므로, 매 호출에서 위 경로 폴백 스니펫으로 `_BAMS`를 다시 구한 뒤 `S="$_BAMS/skills/qa-audit/scripts"`를 설정한다.

**실행 규칙**

1. **실행 전 doctor**: `node "$S/doctor.mjs" --out <run>`을 먼저 돌려(JSON은 stdout, 파일은 `<run>/doctor.md`만) Playwright 출처·버전, axe 상태(`found`/`unverified`)를 리포트 범위·환경 표에 기록한다. axe가 없어도 doctor는 통과이며, A1(axe)만 `unverified`로 남긴다.
2. **Playwright는 플러그인 번들만**: 스크립트는 플러그인 번들(또는 `PLAYWRIGHT_MODULE`)의 Playwright를 쓴다. 대상 레포에 Playwright·axe-core 등 의존성을 추가하거나 설치 명령을 실행하지 않는다. 설치가 필요하면 doctor가 안내하는 플러그인 디렉터리 기준 명령을 메인에 보고하고, 설치 여부는 사용자가 정한다.
3. **허용 호스트 가드**: 기본 허용은 `localhost`/`127.0.0.1`/`::1`이다. 그 밖의 호스트에 쓰는 `--allow-remote`는 사용자가 명시했을 때만 붙인다. 가드 거부(exit 2)를 우회하려고 스스로 `--allow-remote`를 붙이거나 다른 출처 절대 URL을 넣지 않는다. base URL은 `http`/`https`만, 자격증명이 든 URL(`user:pw@host`)과 쿼리(`?`)·조각(`#`)이 붙은 base는 exit 2로 거부된다 — base는 경로까지만 쓰고, 인증은 아래 4번(`--cookie`/`QA_COOKIE`)으로만 넘긴다. 산출물에는 base가 origin + 경로로 기록된다(자격증명·쿼리·조각 제외).
4. **인증**: 쿠키는 `--cookie` 또는 `QA_COOKIE`로만 넘기고 값은 리포트·로그·위임 메시지에 쓰지 않는다(인증 방식만 기록).
5. **직렬 실행**: 스크립트는 한 번에 하나씩, 축 순서 UI → A11Y → PERF로 실행한다. 빌드·테스트 등 다른 무거운 명령과 동시에 돌리지 않는다(qa-strategy QA-STACK 직렬 규칙).
6. **`--server` 필수 기재**: 서버 종류(dev / prod / staging / unknown)를 매 실행에 넘긴다. dev 서버 성능 수치는 운영 수치나 성능 기준 증거로 쓰지 않는다.
7. **exit code 처리**: `0` 실행 완료(결함 발견도 0) / `2` 사용법 오류·가드 거부·프로필 검증 실패 → 인자를 고치고, 가드 거부면 메인에 보고 / `3` 환경 없음(Playwright·브라우저) → 해당 브라우저 층 전체를 `unverified`(사유 포함)로 기록하고 결함·실패로 집계하지 않는다.
8. **스크립트 이상 의심 시 selftest 먼저**: 결과가 비정상(예상 범위에서 결과 0, 예외 종료, 같은 입력에 다른 결과)이면 대상 앱 결함으로 보고하기 전에 `node "$S/selftest/selftest.mjs"`(axe 없으면 `--no-axe`)를 돌린다. selftest 실패는 도구 결함(error_source=env 또는 self)으로 보고하고, 해당 축은 `unverified`로 남긴다.
9. **증거는 명령 + exit code**: 실행한 명령(쿠키 값 제외)·exit code·산출물 경로(`<run>/…`)를 리포트 §재현에 그대로 남긴다. 출력 요약만으로 통과를 주장하지 않는다.

**범위 선언 산출물 형식** (`expected_output: scope_declaration`)

```yaml
scope_declaration:
  axes: [ui, a11y, perf]          # 위임받은 --audit 값 (all = 세 축)
  level: quick | standard | full
  base: http://localhost:<port>   # 원격이면 사용자 명시 --allow-remote 여부 함께
  server: dev | prod | staging | unknown
  routes: [/, /items, /items/<id>]          # 동적 세그먼트는 실제 값으로 치환
  core_routes: [/items]           # 프로필 core_routes ∪ 사용자 지정 ∪ diff 영향 라우트
  viewports: [<width>x<height>, …]
  auth: none | cookie(QA_COOKIE) | <방식>   # 쿠키 값 기재 금지
  endpoints: <endpoints.json 경로> | [{group, name, path}, …]   # PERF 축일 때. measure-api는 GET만(method 미지원)
  ready_selector: "<CSS 셀렉터>"   # 화면 준비 완료 판단 기준
  profile: <.crew/qa-profile.json 경로> | 기본값
  constraints: [<대상 레포 제약 — qa-principles.md §4>]
  missing: [<비어 있는 항목>]      # 메인이 사용자에게 한 번에 묻는다
```

- `core_routes`가 비면 추측으로 채우지 않고 `missing`에 넣는다(메인이 실행 전 1회 확인).
- 축과 무관한 항목(예: UI만일 때 `endpoints`)은 `해당 없음`으로 쓴다 — 빈 필드 금지.

### E2E 실행 구조 최적화

E2E 스위트 구성 시 아래 3개 레버를 **기본값으로 적용**한다(speed clamp/저성능 방지):

**(a) 병렬 워커**
- `playwright.config.ts`에 `workers: process.env.CI ? 4 : '50%'` 명시 — 기본 순차(workers=1) 금지.
- `fullyParallel: true` 설정으로 파일 내 테스트도 병렬화. 공유 자원 충돌은 워커별 격리 fixture로 방지(테스트 간 상태 공유 금지 규칙과 정합).

**(b) 이벤트 기반 wait (고정 sleep 근절)**
- `page.waitForTimeout()` / `sleep` **전면 금지**. `expect(locator).toBeVisible()`, `page.waitForResponse()`, `expect.poll()`로 치환.
- 폴링 필요 시 `expect.poll(fn, { timeout, intervals: [100, 250, 500] })` — 고정 장기 폴링(예: 30s 단일 대기) 금지.
- Next.js 특유 대기 조건(하이드레이션 완료, RSC payload) 우선 점검.

**(c) 재시도 지수 백오프**
- CI 리트라이는 `retries: 1` + `trace: 'on-first-retry'`. 네트워크/외부 의존 재시도는 지수 백오프(base 250ms, factor 2, max 3회) 적용.
- flaky 3회 연속 시 quarantine(Flaky 테스트 대응 규칙 연계) — 백오프로 은폐 금지.

**판정 출력 의무**: E2E 스위트 착수 시 위 (a)(b)(c) 적용 여부를 체크리스트로 출력한다.
```
[ ] workers 설정: {N} (순차 금지)
[ ] sleep/waitForTimeout 잔존: {0건 목표} / grep 검출 {N}건
[ ] 백오프 적용 재시도 지점: {N}곳
```

### E2E 테스트 작성

- 기존 테스트 코드 구조를 Glob, Read로 먼저 파악하여 프로젝트 컨벤션을 따름
- 페이지 객체 패턴(POM)을 적용하여 UI 변경 시 테스트 수정 범위를 최소화
- 하드코딩된 대기(sleep)를 지양하고, 명시적 대기(waitFor)를 사용 — page.waitForTimeout 금지, expect.poll/waitForResponse 사용(§E2E 실행 구조 최적화 참조)
- 하나의 테스트는 하나의 시나리오만 검증 — 테스트 간 상태 공유 금지
- 테스트 실패 시 스크린샷, 콘솔 로그를 자동 캡처하는 설정 포함

### API 테스트 작성

- API 스펙(OpenAPI, 타입 정의)을 먼저 확인하여 검증 포인트를 도출
- 요청/응답 스키마 검증, 상태 코드, 에러 응답, 인증/인가를 모두 커버
- 외부 의존성은 모킹하여 테스트 독립성 확보 — 실제 외부 호출은 통합 환경에서만
- 데이터 정합성 검증 시 DB 상태까지 확인하는 테스트를 별도 구성

### Flaky 테스트 대응

- 실패 로그와 실행 이력을 분석하여 flaky 원인을 타이밍/데이터/환경으로 분류
- 타이밍 이슈: 명시적 대기 조건 추가 또는 폴링 패턴 적용
- 데이터 이슈: 테스트별 독립 데이터 생성으로 전환
- 환경 이슈: Docker Compose 또는 테스트 컨테이너로 환경 격리
- 3회 연속 flaky 발생 시 해당 테스트를 quarantine 처리하고 수정 후 복귀

### CI 연동

- 테스트 스위트를 단위/통합/E2E로 분리하여 단계별 실행
- 병렬 실행으로 전체 소요 시간을 줄이되, 공유 자원 충돌을 방지
- 실패 시 리트라이는 최대 1회로 제한 — 2회 이상 실패는 실제 문제로 간주
- 테스트 결과를 PR 코멘트 또는 Slack 알림으로 자동 공유

### 다른 Agent 협업

- qa-strategy 에이전트로부터 테스트 전략과 자동화 대상 목록을 수신
- frontend-engineering, backend-engineering 에이전트에 테스트 가능성(testability) 개선 요청
- platform-devops 에이전트와 CI 파이프라인 설정 협업
- data-integration 에이전트에 테스트 데이터 요구사항 공유
- ui-designer, design-system-agent 에이전트와 비주얼 회귀 테스트 허용 오차 기준을 합의하고, 기준 스크린샷 갱신 시 협의
