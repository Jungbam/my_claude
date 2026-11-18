# 프로젝트 QA 프로필 (`.crew/qa-profile.json`) [L2]

> `/bams:qa --audit` 범위 선언(SKILL §3 1단계)에서 읽는다. 감사 스크립트가 받는 프로젝트별 값의 스키마와 동작을 정한다.
> 표기: `$S` = 감사 엔진 스크립트 디렉터리, `<run>` = `.crew/artifacts/qa/<YYYY-MM-DD>-<scope>`.
> 필드명·기본값 SSOT는 코드(`$S/lib/profile.mjs`의 `DEFAULT_PROFILE`·`skippedRules()`)다. 이 문서와 다르면 코드가 맞고, 이 문서를 고친다.
> 템플릿: `templates/qa-profile.example.json`(기계 판독 값), `templates/qa-profile.example.md`(사람 판정 기준·프로세스 제약).

## 1. 위치

| 파일 | 필수 | 내용 | 관리 |
|---|---|---|---|
| 대상 레포 `.crew/qa-profile.json` | 선택(없으면 §3) | 스크립트가 읽는 값 — 이 문서의 스키마 | **팀 공유, 커밋 대상** |
| 대상 레포 `.crew/qa-profile.md` | 선택 | 사람이 읽는 판정 기준 요약, 프로세스 제약, 표기 규칙 설명 | 커밋 대상 |

- 프로필이 있으면 모든 감사 스크립트에 `--profile .crew/qa-profile.json`을 넘긴다. 탐색형 QA(`/bams:qa <url>`)도 `base_url`·`core_routes`를 읽는다.
- 명령줄 인자가 프로필보다 우선한다(예: `--base`, `--routes`, `--ready`, `--nocache-header`).

## 2. 로드 규칙

- `DEFAULT_PROFILE`에 프로필 파일을 깊은 병합한다. 객체는 키 단위로 병합하고, 배열·스칼라는 파일 값이 통째로 대체한다(예: `a11y.axe_tags`를 쓰면 기본 태그 목록이 사라진다).
- `name`이 없으면 레포 디렉터리명(`--repo`, 생략 시 현재 디렉터리)으로 채운다.
- `source_roots`를 파일에 쓰지 않았고 `src/`가 없으면 존재하는 `app`·`components`·`pages`로 대체한다. 리포트에 "(src 없음 — 대체)"로 표시된다.
- "없음"은 키가 없거나 값이 `null`·`""`·`[]`·`{}`인 경우다. 둘 다 같은 규칙을 끈다.
- `_`로 시작하는 키는 주석이다. 어느 깊이에 있든 검증하지 않고 경고도 내지 않으며, 어떤 규칙에도 쓰이지 않는다(초안의 `_todo`·`_detected`·`_generated`가 그 예).

## 3. 프로필이 없을 때

1. **기본값으로 실행**한다(§5 기본값 열). 실행을 멈추지 않는다.
2. **초안 생성** — `node "$S/profile-draft.mjs" --repo . --out <run>` → `<run>/qa-profile.draft.json`. 대상 레포에는 쓰지 않는다(§9).
3. **리포트에 명시** — 범위 표에 `프로필 없음 — 기본값, 건너뛴 규칙 N개(미검증)`. N은 각 스크립트 `skipped_rules`를 규칙 이름 기준으로 합친 수다(§6).
4. **저장 여부는 마지막에 1회만 묻는다** — 리포트를 쓴 뒤 AskUserQuestion 한 번: "초안을 `.crew/qa-profile.json`으로 저장할까요?" 승인하면 그때 복사한다. **승인 없이는 `.crew/qa-profile.json`을 쓰지 않는다.** 거절·무응답이면 초안은 `<run>`에만 남는다.

## 4. 검증

| 상황 | 동작 |
|---|---|
| `--profile` 경로에 파일 없음, JSON 파싱 실패, 최상위가 객체 아님 | exit 2 + 경로·오류 메시지 |
| 알려진 키의 타입 불일치(예: `source_roots: "src"`, `viewports`를 배열로 씀) | exit 2. 오류를 모두 모아 한 줄에 하나씩 `profile.<경로>: expected <type>`(예: `profile.project_checks[0].axis: expected "ui"\|"a11y"\|"perf"`)로 출력한 뒤 실패 건수 한 줄 |
| 필수 키 누락(`project_checks[]` 항목의 `name`·`cmd`·`axis`) | 타입 불일치와 같다 — exit 2 + `profile.project_checks[<i>].<키>: expected <type>` |
| 정규식 필드(`raw_color_allowed[]`, `a11y.skip_link_pattern`)가 컴파일되지 않음 | 로드 시 exit 2 + `profile.<경로>: expected regex` |
| `$schema_version`이 있는데 `1`이 아님 | exit 2 + `profile.$schema_version: expected 1`. 키가 없으면 `1`로 본다 |
| 알 수 없는 키(오타 포함, `page_structure`의 8개 밖 키 포함) | **경고만** 한 줄(`경고: <파일> 알 수 없는 키 N개 (무시됨): profile.<경로>, …`) 출력하고 계속 실행. 그 키는 어떤 규칙에도 쓰이지 않는다. `_`로 시작하는 키는 경고하지 않는다(§2) |
| 타입은 맞지만 값의 범위가 틀림(예: `a11y.reflow_width`·`a11y.tab_limit`이 1 이상 정수가 아님) | 로드는 통과하고, 그 값을 쓰는 스크립트(`audit-a11y`)가 exit 2 + 필드 이름 |

exit 2는 실행 실패다. 결함 0건으로 세지 않고, 프로필을 고친 뒤 다시 돌린다. 검증은 파일에 쓴 값(기본값 병합 전)에만 적용한다.

## 5. 필드

`$schema_version`(기본 `1`, 쓰려면 정확히 `1`)은 스키마 버전이다. 아래 "없으면 건너뛰는 규칙"은 `skippedRules()`가 `skipped_rules`에 남기는 규칙(§6)이다. "—"는 기본값으로 그대로 실행되어 건너뛰는 규칙이 없다는 뜻이다.

### 실행 범위

| 필드 | 타입 | 기본값 | 사용처 | 없으면 건너뛰는 규칙 |
|---|---|---|---|---|
| `name` | string \| null | 레포 디렉터리명 | 리포트 머리말 | — |
| `base_url` | string | `http://localhost:3000` | 브라우저·측정 스크립트 `--base` 기본값 | — |
| `core_routes` | string[] | `[]` | 핵심 경로(판정 매핑의 핵심 경로 정의 대상). `routes`가 비면 `inspect-computed-style`·`audit-a11y`의 라우트 | — (비어 있으면 SKILL §3이 실행 전 1회 묻는다. `--routes`도 `routes`도 없으면 브라우저 스크립트는 exit 2) |
| `routes` | string[] | `[]` | `standard` 기본 라우트. `inspect-computed-style`·`audit-a11y`가 `core_routes`보다 먼저 쓴다 | — |
| `ready_selector` | string \| null | `null` | `--ready` 기본값(데이터가 보인 시점) | — (ready 측정만 생략) |
| `viewports` | string(쉼표 구분, 배열 아님) | `"1440x1000,390x844"` | `--viewports` 기본값 | — |
| `base_branch` | string \| null | `null`(자동 감지) | `scan-ui-static`의 git 기준 브랜치 | — |
| `design_docs` | string[] | `[]` | 판정 기준 문서(대상 레포 경로) | — (스크립트 규칙은 아니다. 기준 문서가 필요한 위계·역할 판정은 `ui-audit.md`대로 `미검증`) |

### UI 정적 스캔 (`scan-ui-static`)

| 필드 | 타입 | 기본값 | 사용처 | 없으면 건너뛰는 규칙 |
|---|---|---|---|---|
| `source_roots` | string[] | `["src"]`(없으면 `app`·`components`·`pages`) | 스캔 대상·CSS 변수 정의 수집 범위 | — |
| `extensions` | string[] | `[".ts", ".tsx", ".js", ".jsx", ".css"]` | 스캔 대상 확장자 | — |
| `ui_dir` | string \| null | `null` | 공통 UI 디렉터리 — U2 탭 래퍼·U3 비교 기준 | `U2-tabs-without-panel`, `U3-duplicate`, `U3-duplicate-breadcrumb`, `U3-raw-table`. 값이 있어도 경로가 없으면 `U3-duplicate`, `breadcrumb*`·`table*` 파일이 없으면 각각 `U3-duplicate-breadcrumb`·`U3-raw-table` |
| `token_definition_files` | string[] | `[]` | 토큰 정의 파일(레포 상대 경로) — 이 파일의 사용자 정의 속성 정의 줄은 `U4-raw-color` 제외 | — (비면 **모든** CSS 파일의 `--x: 값` 정의 줄을 제외한다. 리포트에 한 줄로 표시) |
| `runtime_vars` | string[] | `[]` | 런타임에 주입되는 CSS 변수 — `U4-undefined-var` 예외 | — |
| `raw_color_allowed` | string[](정규식) | `[]` | 레포 상대 파일 경로에 맞으면 `U4-raw-color` 예외 | — |
| `skeleton_files` | string[] | `["skeleton", "placeholder"]` | 파일 경로에 포함되면 `P6-direct-pulse` 예외 | — |
| `banned_imports` | string[] | `[]` | 금지 모듈(접두 일치) | `U2-banned-import` |
| `ui_wrappers` | {module: path} | `{}` | 래퍼가 있는 모듈 → 래퍼 경로 | `U2-bypass-wrapper` |
| `duplicate_threshold` | number | `0.4` | U3 유사도 기준 | — |

### UI·A11Y 브라우저 측정 (`inspect-computed-style`)

| 필드 | 타입 | 기본값 | 사용처 | 없으면 건너뛰는 규칙 |
|---|---|---|---|---|
| `typography` | {클래스명: {`size_rem` \| `size_px_desktop` + `size_px_mobile`, `line_height`, `weight`}} | `{}` | 역할 클래스별 computed 크기·행간(글자 크기 대비 배수)·굵기 대조 | `U5-role-mismatch` |
| `extra_font_sizes_px` | number[] | `[]` | `typography` 밖에서 허용하는 글자 크기 | `U5-off-scale` |
| `mobile_breakpoint_px` | number | `768` | 모바일 viewport 판별 | — |
| `target_size_px` | {mobile, minimum} | `{mobile: 44, minimum: 24}` | U7·A7 터치 대상 | — |
| `contrast` | {normal, large, ui} | `{normal: 4.5, large: 3, ui: 3}` | U7·A7 대비 | — |
| `page_structure` | {container, breadcrumb, header, card, table, skeleton, refresh_notice, empty} — 알려진 키는 이 8개뿐(밖의 키는 경고). 각 값은 컴포넌트 경로 또는 이름(타입 검사 없음) | `{}` | U6 위계 판정, 로딩 체크리스트 활성화 | 규칙을 끄는 키는 `skeleton`(`L-skeleton`)·`refresh_notice`(`L-refresh-notice`) 둘뿐이다. 나머지 6개 키는 스크립트 규칙을 끄지 않는다 — 비면 U6 위계 판정을 사람이 `미검증`으로 둔다(간격 스캔은 실행) |

### PERF (`measure-api`·`measure-web`·`skeleton-hold`)

| 필드 | 타입 | 기본값 | 사용처 | 없으면 건너뛰는 규칙 |
|---|---|---|---|---|
| `perf.server_env` | string[] | `[]` | 서버 측 캐시 우회·추적 설정 안내 문구(리포트·측정 윈도우) | — |
| `perf.nocache_header` | string \| null | `null` | server-cold 캐시 우회 요청 헤더 이름 | `P-server-cold` (`measure-api`가 server-cold 행을 `unverified`로 남김) |
| `perf.server_timing_names` | string[] | `[]`(전부) | Server-Timing 요약 대상 지표 | — |
| `perf.budgets` | {라우트·엔드포인트: {`api_p95_ms`?, `lcp_mobile_ms`?, `ready_ms`?}} | `{}` | 성능 예산 판정 | `P-budget` (기준선만 기록, 성능 판정 미사용) |

예산 값은 첫 실행의 기준선을 본 뒤 팀이 합의해 넣는다(`perf-audit.md`). 템플릿의 숫자는 자리표시자이고 권장값이 아니다.

### A11Y (`audit-a11y`, 일부 `scan-ui-static`)

`a11y`는 객체 병합이라 바꿀 키만 쓴다. 모두 기본값이 있어 건너뛰는 규칙이 없다.

| 필드 | 타입 | 기본값 | 사용처 |
|---|---|---|---|
| `a11y.axe_tags` | string[] | `["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]` | A1 axe 태그 |
| `a11y.global_focus_rule` | boolean | `false` | `true`면 레이어 밖 전역 `:focus-visible` 규칙이 있다는 선언 — `scan-ui-static`의 `A3-outline-none` 정적 검사를 끄고 `audit-a11y` A3 렌더 포커스로 판정한다(이 경우 `skipped_rules`에 남지 않는다) |
| `a11y.skip_link_pattern` | string(정규식, 대소문자 무시) | `skip\|본문\|main content\|콘텐츠로` | 건너뛰기 링크 탐지 |
| `a11y.reflow_width` | integer ≥ 1 | `320` | A4 reflow 폭 |
| `a11y.tab_limit` | integer ≥ 1 | `80` | 키보드 순회 최대 Tab 횟수(`--tab-limit`이 우선) |
| `a11y.placeholder_glyphs` | string[] | `["—", "–", "-", "N/A", "n/a"]` | 보조기기 데이터 표기 점검 대상 자리표시 문자 |
| `a11y.skeleton_selector` | string(셀렉터) | `[data-slot='skeleton'],.animate-pulse,[class*='skeleton']` | 스켈레톤 노출 점검 |
| `a11y.ignore_selector` | string(셀렉터) | 개발 서버 도구 오버레이 셀렉터 | 제품 UI가 아닌 요소 제외 |

### 로딩 (`loading-skeleton-checklist.md`, `measure-web`·`skeleton-hold`)

| 필드 | 타입 | 기본값 | 사용처 | 없으면 건너뛰는 규칙 |
|---|---|---|---|---|
| `loading.busy_selector` | string(셀렉터) | `[role='status'][aria-busy='true']` | 로딩 상태 탐지(`--busy-selector`가 우선) | — |
| `loading.blocking_threshold_ms` | number \| null | `null` | 화면 차단 로딩 판단 기준 | `L-blocking-threshold` |
| `loading.slow_ms` | number \| null | `null` | 느린 로딩 안내 시점 | `L-slow` |
| `loading.overdue_ms` | number \| null | `null` | 지연 초과(오류·재시도 안내) 시점 | `L-overdue` |

### 프로젝트 규칙 (§7–§8)

| 필드 | 타입 | 기본값 | 사용처 | 없으면 건너뛰는 규칙 |
|---|---|---|---|---|
| `project_checks` | [{`name`, `cmd`, `axis`: `ui` \| `a11y` \| `perf`}] — 세 키 모두 필수(빠지면 exit 2) | `[]` | 프로젝트 자체 검증 명령 — 엔진이 직렬 실행 | — (실행할 명령이 없을 뿐) |
| `notation_rules` | [{`scope`, `rule`}] | `[]` | 화면 표기와 출처 표기의 수동 대조 | — (표기 대조 단계 생략, 리포트 `미검증·한계`에 기록) |
| `forbidden_ops` | string[] | `[]` | 금지 작업 요약 | — |

## 6. 건너뛴 규칙 보고

- 필드가 없어 꺼진 규칙은 **통과가 아니라 미검증**이다. 스크립트는 json `skipped_rules`(`rule`, `field`, `reason`)와 md "건너뛴 규칙(미검증)" 표에 남긴다.
- `skippedRules()` 범위: `scan`(`scan-ui-static`) · `computed`(`inspect-computed-style`) · `perf` · `checklist`(로딩 체크리스트, 사람이 확인). `perf`·`checklist` 항목은 리포트를 쓸 때 프로필을 보고 옮긴다.
- `audit-a11y`의 `skipped_rules`(`A1-axe` 번들 없음, `--no-reflow`, `--no-spacing`)는 프로필이 아니라 도구·플래그 때문이다. 같은 미검증 표에 싣되 "프로필 없음" 개수에는 넣지 않는다.
- 리포트 범위 표 문구: 프로필 있음 → `프로필: <경로> · 건너뛴 규칙 N개(미검증)`, 프로필 없음 → §3의 문구. 규칙 이름 목록은 `미검증·한계` 절에 둔다.

## 7. `project_checks` — 프로젝트 검증 명령

- **실행 전 사용자 승인** — `cmd`는 감사 대상 레포가 정한 임의 명령이므로 엔진이 범위 선언에서 목록(`name`·`axis`·`cmd` 원문)을 보여 주고 승인을 받은 항목만 실행한다(엔진 SKILL §프로젝트 검증 명령). 승인은 그 실행에만 유효하고, 거절·건너뛴 항목은 `미검증·한계`에 쓴다.
- 엔진이 범위 선언 직후, 축 실행 전에 **목록 순서대로 직렬** 실행한다. 병렬로 돌리지 않는다.
- 명령마다 **명령 문자열 + exit code**를 증거로 리포트에 싣는다(출력은 필요한 줄만 발췌). `axis`는 결과를 실을 축이다.
- exit ≠ 0은 그 축의 후보다. 결함 판정·심각도는 다른 후보와 같은 절차(축 문서 → 플러그인 루트 `references/issue-severity.md` §QA 판정 매핑)를 따른다. 이 문서는 임계값을 두지 않는다.
- 명령이 대상 레포 제약(§9 `forbidden_ops`, `CLAUDE.md`, `.crew/`)과 충돌하면 실행하지 않고 `미검증·한계`에 사유를 쓴다.
- 감사 중 리뷰 반영으로 코드가 바뀌면 `project_checks` 전체를 다시 실행한다(일부만 재실행하지 않는다).

## 8. `notation_rules` — 표기 대조

- 스크립트가 판정하지 않는다. 사람(감사자)이 `scope` 화면에서 표기를 원문 출처와 **수동 대조**한다.
- 결과는 규칙별로 대조한 화면 수와 불일치 수를 쓴다. 대조하지 못한 규칙은 `미검증`.
- 출처별 서식명·단위·제도 표현처럼 도메인 특화 내용은 대상 레포 프로필에만 둔다. 플러그인 문서에 실례를 옮기지 않는다.

## 9. `forbidden_ops` — 금지 작업 요약

- 대상 레포의 금지 작업을 감사자가 한눈에 보도록 **요약한 목록일 뿐**이다. 정본은 대상 레포 `CLAUDE.md`, `.crew/config.md`, `.crew/gotchas.md`이고, 서로 다르면 **그쪽이 우선**한다(`qa-principles.md` §4).
- 비어 있어도 위 정본 확인(SKILL §3 2단계)은 생략하지 않는다.

## 10. 초안 생성·승인 절차

1. `node "$S/profile-draft.mjs" --repo . --out <run>` — 두 플래그 모두 필수. 출력은 `<run>/qa-profile.draft.json` 하나이고, 대상 레포에는 아무것도 쓰지 않는다.
2. 초안은 레포 구조에서 감지할 수 있는 값(`source_roots`, `ui_dir`, 토큰 정의 CSS, `ui_dir` 래퍼 → `ui_wrappers`, `base_branch`, 개발 서버 포트 → `base_url`)만 채운다. `typography`·`core_routes`처럼 사람이 정해야 하는 값은 비우고 `_todo`(할 일 목록)에 남긴다. 감지 근거는 `_detected`, 생성 시각·도구는 `_generated`에 둔다.
3. 리포트 `미검증·한계`에 초안 경로와 `_todo` 목록을 쓴다.
4. 감사 마지막에 AskUserQuestion 1회로 저장 여부를 묻는다(§3 4단계). 승인 시 `.crew/qa-profile.json`으로 복사하고 커밋은 사용자에게 맡긴다. `_` 키는 검증·경고 대상이 아니므로(§2) 초안을 그대로 저장해도 된다. `_todo` 항목은 채운 뒤 목록에서 지운다.
5. 이미 프로필이 있는데 기준 문서(`design_docs`)나 레포 구조가 더 새로우면 갱신을 제안만 한다. 승인 없이 기존 프로필을 고치지 않는다.
