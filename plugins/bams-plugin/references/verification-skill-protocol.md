# 프로젝트 검증 스킬 프로토콜 (SSOT)

> `/bams:init` Step 11.5(생성), `/bams:verify` Phase 0(사용), 유지보수 루프가 공용으로 참조한다.
> 목적: "이 앱을 띄우고, 기능을 사용자처럼 직접 조작하고, 증거를 남기는" 방법을 매번 추측하지 않도록 프로젝트 로컬 스킬로 고정한다.
> 템플릿: `templates/verify-skill/` (`SKILL.template.md`, `features/README.template.md`, `features/_feature.template.md`).

## 1. 산출물 위치

| 파일 | 내용 |
|------|------|
| `.claude/skills/verify-<app>/SKILL.md` | 검증 스킬 본체 (Launch · Doctor · Drive · Evidence · Cleanup) |
| `.claude/skills/verify-<app>/features/README.md` | feature map 인덱스 + 공통 전제(baseline) + 증거 규칙 |
| `.claude/skills/verify-<app>/features/<feature>.md` | 사용자 기능 1개당 1파일 (초기 3~5개) |
| `.claude/skills/verify-<app>/scripts/*` | (선택) helper 스크립트 — 실행 권한 + 본문에 호출법 명시 |
| `.crew/artifacts/test/verify-<app>/<run-id>/` | 실행 증거 (스크린샷, 응답 본문, 로그, exit code) — cleanup 대상 아님 |

`<app>`은 package.json `name` / 리포 디렉토리명을 kebab-case로. 이미 `.claude/skills/verify-*`가 있으면 새로 만들지 않고 §6 유지보수 모드로 전환한다.

## 2. 리포 인터뷰 (사용자에게 묻기 전에 코드에서 답한다)

관찰 가능한 것은 코드에서 확인하고, 관찰할 수 없는 것(로그인 계정, 외부 시크릿 등)만 사용자에게 묻는다.

| 질문 | 확인 위치 |
|------|----------|
| Surface — 사용자가 실제로 만지는 것 (웹 UI / API / CLI / 라이브러리) | `src/app/**`, `pages/**`, `src/app/api/**`, `routes/`, `bin/`, `package.json` `bin` |
| Run — 로컬 기동 명령, 포트, 준비 신호 | `package.json` scripts(`dev`/`start`/`serve`), `Makefile`, `docker-compose*.yml`, `Procfile`, README quickstart |
| Env — 필요한 환경 변수, 시드 데이터, 인증 | `.env.example`, `.env.sample`, `config/`, `prisma/seed*`, `migrations/` |
| Drive — 프로그램으로 조작하는 방법 | 기존 Playwright/Cypress spec, e2e 디렉토리 → 없으면 generic: 웹=bams `browse` 스킬, API=`curl`, CLI=직접 실행 |
| Observe — 남길 수 있는 증거 | 스크린샷, ARIA snapshot, 응답 본문, 로그, exit code, DB 상태 |
| Isolate — 두 인스턴스 병행 가능 여부 | 포트 하드코딩, 데이터 디렉토리, 공유 DB 사용 여부 |

`.crew/artifacts/review/init-review.md`(Step 6-7 결과)가 있으면 먼저 재사용한다. 체크아웃이 그대로 기동되지 않으면 스킬 생성 전에 원인을 정확히 보고한다(깨진 기반 위에 쓴 스킬은 틀린 절차를 가르친다).

## 3. 생성 규칙 — SKILL.md 섹션

frontmatter `name: verify-<app>`, `description`(앱 이름 + surface + 언제 쓰는지)이 없으면 스킬이 등록되지 않는다. 모든 섹션은 인터뷰에서 실제로 찾은 값으로 채운다 — 플레이스홀더(`{...}`)가 남으면 생성 실패. 구조·플레이스홀더·proven 주장은 `scripts/check-verify-skill.sh`가 기계 검사한다(§5-1).

- **Launch**: 검증용 기동 정확한 명령 + 준비 판정(로그 라인, health URL 200 + 실제 화면 렌더). 빈 데이터 디렉토리에서 마이그레이션·시드까지 포함해 "사용 가능한" 상태까지 도달해야 한다. 프로세스가 응답한다 ≠ 준비됨. 단명 CLI는 빌드/의존성 설치 1회 후 drive마다 새로 실행. **안전**: DB·큐·스토리지 접속 대상이 localhost/로컬 컨테이너가 아니면(공유 dev·staging·prod) 마이그레이션·시드·쓰기 drive를 하지 않는다 — 로컬 대체(docker-compose 등)가 없으면 `draft` + `blocked_by`로 남긴다.
- **Doctor**: 읽기 전용 상태 점검 1세트 — 프로세스 기동, 포트 소유(우리가 띄운 것), 빌드/버전, 인증 유효. 이상해 보이면 언제든 먼저 실행. 변경 동작 금지.
- **Drive**: 이 리포의 실제 route·selector·명령으로 작성 (예시 금지). 안정 핸들 우선(ARIA role/name, `data-testid`, route path, CLI 프롬프트) — 좌표·탭 순서 금지.
  - 웹: bams `browse` 스킬(`$B goto` → `$B snapshot -i` → `$B click/fill` → `$B snapshot -D`)
  - API: `curl -sS -w '%{http_code}'` + 응답 본문 저장
  - CLI: 명령 + stdout/stderr/exit code 저장
- **Evidence**: 증거 저장 위치(§1) + 증거 기준 — 실제 사용자 경로로 조작(내부 setter·테스트 전용 엔드포인트 금지), 행동과 결과 상태를 모두 캡처, 부수효과(파일·DB 행·메시지)도 확인, mock은 프로덕션 경계가 이미 외부 시스템을 격리하는 곳에서만. dry-run은 이름을 믿지 말고 실제로 무엇을 건너뛰는지 관찰로 확인.
- **Cleanup**: 이 실행이 띄운 것만 종료(PID 파일 기준, 프로세스 이름으로 kill 금지). 인스턴스·스크래치 상태만 지우고 증거는 남긴다. cleanup 후 증거 존재를 재확인한다.
- **Status**: 본문 상단 `status:` 블록 (§5).

## 4. feature map

`features/README.md` + 사용자 기능 1개당 1파일(route/메뉴/커맨드/문서에서 상위 3~5개). 각 기능 파일은 사용자 관점으로 정확히 4개 H2를 이 순서로 둔다:

1. `Sub-features` — 짧은 ID + 한 줄 설명
2. `How to get to it (user POV)` — 모든 사용자 진입점
3. `Driving it with <harness>` — `Preconditions:` 후 "행동 → 정확한 명령 → 관찰 가능한 결과" 쌍
4. `Gotchas` — 검증을 낭비·무효화하는 함정

시드 데이터에 전제가 없으면 여정은 실패로 보고하고 사유를 `Gotchas`에 적는다. **통과시키려고 여정을 약화하지 않는다.** map에 진입점이 여러 개면 편한 하나만 돌린 증명은 불완전하다.

## 5. draft → proven (1회 실증 필수)

생성 직후 스킬은 `status: draft`다. 생성한 에이전트가 스킬 자신의 지시만으로 끝까지 1회 실행한다:

1. Launch → 2. Doctor → 3. map의 기능 1개 Drive → 4. Evidence 캡처 → 5. Cleanup → 6. cleanup 후 증거가 지정 위치에 남아 있는지 확인

- 실패하면 스킬을 고치고 재시도 (최대 2회). 실패한 반복마다 생성된 Cleanup도 실행해 프로세스·포트를 남기지 않는다.
- 성공 시 상단 Status 블록을 갱신:
  ```
  status: proven
  proven_at: YYYY-MM-DD
  proven_commit: <git rev-parse --short HEAD>
  proven_feature: <feature-id>
  evidence: .crew/artifacts/test/verify-<app>/<run-id>/
  ```
- **기계 검사 (§5-1) 통과 전에는 proven이 아니다.** Status 블록을 proven으로 쓴 직후 검사를 돌리고, 통과하지 못하면 proven을 남기지 않는다.
- 끝내 실패하거나 실행 불가(시크릿·외부 접근·사용자 계정 필요)면 `status: draft` 유지 + `blocked_by:`에 구체 전제(필요한 env 키, 접근 권한, 시도한 명령)를 기록한다. 실행되지 않은 스킬은 산출물이 아니라 초안이다.
- 대체 환경(로컬 docker로 원격 대체 등)에서 증명했다면 대체 환경만 해 준 셋업 단계를 `unverified_on_target:`에 나열한다.
- 결과 기록: `.crew/config.md`의 `## 검증 스킬` 섹션(경로, status, proven_at, blocked_by)과 `.crew/artifacts/report/verify-skill-{YYYY-MM-DD}.md`(실행 로그 요약 + §5-1 검사 출력).

### 5-1. 기계 검사 — `scripts/check-verify-skill.sh` (생성 에이전트 필수)

`status: proven`은 생성 에이전트의 자기 기록이므로 그대로 믿지 않는다. 생성·유지보수·proven 승격 직후 반드시 실행한다(`$_BAMS` = `references/plugin-cache-sync.md` §런타임 경로 해석으로 얻은 플러그인 루트):

```bash
bash "$_BAMS/scripts/check-verify-skill.sh" .claude/skills/verify-<app>   # [repo-root] 생략 시 git toplevel
```

| 검사 | 실패 조건 |
|------|----------|
| 구조 | frontmatter `name: verify-*`·`description` 없음, `## Launch`/`## Doctor`/`## Drive`/`## Evidence`/`## Cleanup` 중 하나라도 없음, `status:` 없음·값 오류, `features/README.md` 없음 |
| 플레이스홀더 | SKILL.md·`features/**/*.md`에 템플릿 `{…}` 1개 이상 (HTML 주석, `${…}`·`%{…}`, 공백으로 시작하는 `{ cmd; }`, 따옴표·`$`가 든 JSON/awk, `{a,b}` 확장은 제외) |
| proven 주장 | `proven_commit`이 `git cat-file -e <sha>^{commit}`로 해석되지 않음, `evidence` 디렉터리 없음 또는 크기 > 0 파일 0개, `proven_at`(YYYY-MM-DD)·`proven_feature` 비어 있음 |

- **exit 0 + `RESULT: proven`일 때만 proven이다.** exit 0 + `RESULT: draft`는 구조가 온전한 초안.
- exit 1 → 출력의 `FAIL:` 줄을 고치고 재실행한다. 고칠 수 없으면(증거 유실 등) `status: draft`로 되돌리고 `blocked_by:`에 검사 출력을 적는다.
- 반환·보고서에 검사 출력 마지막 줄(`RESULT: …`)을 그대로 첨부한다. 회귀 테스트: `bash tests/verify-skill/run.sh`.

## 6. ezar 서비스 Doctor (선택)

`references/ezar-infra-deploy.md` §1 판별(MCP 가용 + repo → 서비스 매핑 확정)을 통과한 경우에만, Doctor에 원격 상태 점검을 추가한다:

- `mcp__ezar-infra__dev_service_get` / `dev_deploy_status`(ArgoCD Synced+Healthy, 배포 tag vs 최신 빌드 tag) / `dev_pods`(Running/Ready, 재시작 급증 없음). 이상 시 `dev_pod_logs`.
- **읽기 전용 도구만.** `dev_build_trigger`·`dev_restart`·`dev_rollback`·승인·시크릿 도구는 검증 스킬에 넣지 않는다.
- 서비스명은 추측하지 않고 §1 매핑 결과(또는 CLAUDE.md `ezar-infra service:`)를 스킬에 그대로 기록한다.
- 원격 Doctor는 로컬 Launch를 대체하지 않는다 — 로컬 Drive가 기본, 원격은 "배포된 인스턴스가 운전할 가치가 있는가"의 보조 신호.

## 7. 사용 규칙 (`/bams:verify`, 파이프라인 검증 단계)

- `.claude/skills/verify-*/SKILL.md`가 있으면 build/lint/typecheck/test보다 먼저 사용한다.
- **신뢰 전에 §5-1 검사를 돌린다.** exit ≠ 0, `RESULT: draft`, 또는 스크립트를 찾지 못하면 Status 블록의 표기와 무관하게 **draft로 취급**한다.
- 변경 파일 → feature map 매칭으로 drive 대상 기능을 고른다(매칭 0건이면 map 첫 기능 1개를 smoke로).
- `status: draft`(또는 위 검사로 draft 취급된) 스킬은 실행 결과를 product 판정에 쓰지 않는다 — 실행해서 성공하면 §5대로 proven 승격(§5-1 검사 통과 필수), 실패하면 `inconclusive (draft)`로 기록하고 build/lint/typecheck/test 결과로 판정한다.
- Drive는 이 실행이 띄운 로컬 인스턴스에만 한다. 공유·운영 인스턴스는 Doctor(읽기)만 허용.

## 8. 유지보수 (drift)

- **재실행 조건**: (a) `package.json` scripts, `docker-compose*`, `Makefile`, `.env.example`, 라우트 디렉토리가 `proven_commit` 이후 변경, (b) Doctor/Launch가 제품 변경 없이 실패, (c) `/bams:init` 부분 재초기화. → init Step 11.5를 유지보수 모드로 재실행: 기존 스킬 Read → drift 수정 → §5 실증 재수행.
- **실패 귀속 규칙**: 검증 스킬이 **이번 diff가 건드리지 않은 기능**에서 실패하면 기본 가정은 스킬 drift다 → **스킬(SKILL.md·features·scripts)을 고치고, 제품 코드는 고치지 않는다.** 고친 뒤 해당 기능을 다시 drive해 통과를 확인한다.
- 실제로 앱 동작이 깨진 것(제품 회귀)으로 확인되면 map을 약화해 덮지 말고 결함으로 보고한다(`/bams:hotfix` 후보).
- 유지보수 편집 범위는 `.claude/skills/verify-<app>/` 디렉토리 한정.
- 결과는 셋 중 하나로 보고: `clean`(변경 없음) / `changed`(스킬 수정 + 재실증) / `blocked`(무엇이 막았는지 구체적으로).
