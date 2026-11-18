# A11Y 접근성 감사 (A1–A7) [L2]

> `/bams:qa --audit a11y` 단계에서 읽는다. 관찰 전용 — 수정은 사용자 요청 시 `/bams:hotfix`·`/bams:dev`.
> 표기: `$S` = 감사 엔진 스크립트 디렉터리(SKILL §실행 환경에서 설정), `<run>` = `.crew/artifacts/qa/<YYYY-MM-DD>-<scope>`.

목표: 키보드·스크린리더·확대·reduced motion 사용자가 화면의 **같은 정보와 같은 기능**에 도달하는지 확인한다. 참조 기준은 WCAG 2.2 AA이고, 대상 레포의 접근성 규칙(프로필 `design_docs`가 가리키는 문서, `.crew/qa-profile.md`)이 있으면 그것이 우선한다.

세 층으로 본다.

| 층 | 도구 | 잡는 것 |
|---|---|---|
| 정적 | `scan-ui-static.mjs` (A2/A3 규칙) | alt 없는 이미지, 이름 없는 아이콘 버튼, 클릭 가능한 비대화형 요소, 대체 표시 없는 `outline: none`, 양수 tabIndex |
| 브라우저 | `audit-a11y.mjs` + `inspect-computed-style.mjs` | axe 자동 규칙, 구조·이름, Tab 순회, 포커스 표시·가림·트랩, 320px reflow, 텍스트 간격, reduced motion, 로딩 상태, 자리표시 기호 / 대비·터치 대상 |
| 수동 | 키보드 흐름, 스크린리더 표본 | 의미 전달, 읽기 순서, 공지 시점, 데이터 문맥 |

자동 검사(axe 포함)는 WCAG 기준의 일부만 판정한다. 결과는 `자동 검사 위반 0`으로 쓰고 "접근성 준수"로 쓰지 않는다(`references/qa-principles.md` 원칙 8). 키보드 흐름 수동 확인 없이 A11Y 축을 통과로 두지 않는다.

## 실행

먼저 `node "$S/doctor.mjs"`로 Playwright·axe 출처와 버전을 확인하고 리포트 범위·환경 표에 적는다.

```sh
# 정적: UI 축과 같은 실행이면 ui-static.md의 A2/A3 행을 그대로 쓴다
node "$S/scan-ui-static.mjs" --repo . --profile .crew/qa-profile.json --base origin/main --out <run>

# 브라우저: 대비·터치 대상 (UI 축에서 이미 돌렸으면 생략)
node "$S/inspect-computed-style.mjs" --profile .crew/qa-profile.json \
  --base http://localhost:3000 --routes /products/1 --server dev --out <run>

# 브라우저: 접근성 감사
node "$S/audit-a11y.mjs" --profile .crew/qa-profile.json \
  --base http://localhost:3000 --routes /,/products/1,/settings \
  --viewports 1440x1000,390x844 --server dev --out <run>
```

- 프로필이 없으면 `--profile`을 빼고 실행한다(기본값, 끈 규칙은 `skipped_rules` → `미검증`).
- **axe 해석 순서**: `--axe <path>` → env `AXE_PATH` → 플러그인 번들 → 대상 레포 `node_modules/axe-core`(읽기만). 모두 없으면 A1은 `미검증`이다 — **실패가 아니다**. 대상 레포에 의존성을 추가하지 않는다. 번들 설치 안내는 doctor 출력을 따른다.
- `--axe none`: axe를 끄고 나머지 브라우저 검사만 한다(A1 `미검증`).
- `--ready <selector>`: 스트리밍·클라이언트 로딩 화면은 데이터 영역이 뜬 뒤 검사한다. 스켈레톤 상태 자체는 `perf-audit.md` P6이 본다.
- `--tab-limit <n>`: Tab 순회 최대 횟수(프로필 `a11y.tab_limit`). 긴 목록 화면에서 "문서 끝에 도달하지 않음"이 나오면 늘리고, 늘린 값을 리포트에 쓴다.
- `--no-reflow`, `--no-spacing`: 해당 검사를 끈다. 끈 검사는 `미검증`으로 옮긴다.
- 인증 화면은 `--cookie` 또는 `QA_COOKIE`. 값은 리포트·로그에 쓰지 않는다. localhost/127.0.0.1/::1 외 호스트는 사용자가 명시했을 때만 `--allow-remote`.
- HTTP 4xx/5xx 화면은 자동 제외되고 `HTTP n — 정상 UI 검사에서 제외`(`inspect-computed-style`은 `HTTP n — 정상 UI 검사 제외`, md 요약 줄에 검사 제외 수)로 남는다. 분모에서 빼고 따로 센다.
- 컨텍스트는 `reducedMotion: "reduce"`로 열린다. 무한 애니메이션 후보는 reduce 설정에서도 계속 도는 것이다.
- 검사 전에 페이지를 끝까지 한 번 스크롤한다(뷰포트 진입 시 로드되는 섹션의 로딩 표시를 "남은 busy"로 세지 않기 위해).
- dev 서버 전용 개발 도구 오버레이는 프로필 `a11y.ignore_selector`(기본값에 흔한 프레임워크 dev overlay·devtools 포함)로 제외한다. 프로덕션 빌드에는 없다.

산출물: `<run>/a11y.{json,md}`, `<run>/ui-static.*`, `<run>/ui-computed.*`. `a11y.json` 키:
- 최상위 `axe` = `{status: "found"|"unverified", source, version}`(미검증이면 `reason`), `skipped_rules` = `[{rule, reason, field}]`(`A1-axe`·`A4-reflow`·`A4-text-spacing`), `results[]`.
- `results[]` 행(route × viewport): `http`, `structure.*`, `motion`, `axe` = `{status: "ran"|"unverified", source, version, violations, incomplete}`(미검증이면 `reason`, violations·incomplete는 null), `text_spacing_clipped`, `keyboard.*`, `reflow` = `{width, overflow, scroll_width, culprits}`, `page_errors`. HTTP 4xx/5xx 행은 `skipped`, 검사 실패 행은 `error`.

## 단계

| 단계 | 확인 | 스크립트 결과 | 판정 |
|---|---|---|---|
| A1 자동 규칙 | axe WCAG 2.0/2.1/2.2 A·AA 태그(프로필 `a11y.axe_tags`) 위반 | `axe.violations`, `axe.incomplete` 수 | axe 미발견이면 `미검증`(실패 아님). 위반마다 노드를 열어 확인한 뒤 결함으로 올린다. `incomplete`는 수동 확인 목록으로 넘긴다 |
| A2 구조·이름 | `<html lang>`, 문서 title, main 하나, 제목 단계(h1→h3 건너뜀 없음), 이미지 alt(장식은 `alt=""`), 컨트롤 이름, 입력 라벨(placeholder는 라벨이 아님), 표 헤더 셀(`th`, scope), aria-hidden 안 포커스 요소 없음, aria가 가리키는 id 중복 없음 | `structure.*`, 정적 `A2-*` | 이름 계산은 근사다. 브라우저 접근성 트리로 확인 후 결함으로 올린다 |
| A3 키보드 | 첫 Tab이 skip link, 모든 기능에 키보드로 도달, 포커스 표시가 보임(전후 스타일 변화), 포커스가 sticky/fixed 층에 가려지지 않음(2.4.11), 키보드 트랩 없음(2.1.2), 양수 tabindex 없음, 클릭 가능한 비대화형 요소 없음 | `keyboard.*`, `structure.positive_tabindex`, 정적 `A3-*` | 트랩은 P0. 다이얼로그·드로어 안의 의도된 포커스 순환은 Escape로 빠져나오면 트랩이 아니다 |
| A4 확대·간격·모션 | 320 CSS px에서 가로 넘침 없음(1.4.10, 데이터 표 자체의 가로 스크롤은 허용), 텍스트 간격 조정(1.4.12) 시 잘림 없음, reduced motion에서 무한 애니메이션 없음 | `reflow`, `text_spacing_clipped`, `motion` | 넘침 원인 요소(`culprits`)를 코드에서 찾는다 |
| A5 상태 공지 | 로드 후 남은 `aria-busy` 없음, 스켈레톤 도형은 `aria-hidden`이고 status 안내는 상위 하나, 오류는 `role="alert"`, 재조회 알림(프로필 `page_structure.refresh_notice`)은 live region | `structure.busy_after_load`, `structure.skeleton_exposed` | 로딩 중 공지는 `loading-skeleton-checklist.md`와 함께 본다 |
| A6 데이터 읽기 | 아래 표 | `structure.placeholder_no_text` | 0 / 미표기(—) / 데이터 부재를 보조기기에서도 구분하는지(`references/qa-principles.md` 원칙 3) |
| A7 대비·대상 크기 | 본문·큰 글자·컨트롤 경계/포커스 대비(프로필 `contrast`), 모바일 대상 크기(프로필 `target_size_px`, 2.5.8) | `ui-computed.md`의 `contrast_fail`, `small_targets` | disabled·장식 예외를 본문에 적용하지 않는다. UI 축 U7과 같은 측정이면 한 번만 싣는다 |

### A6 데이터를 보조기기로 읽을 때

화면에서 맞게 보이는 값도 스크린리더로는 다르게 들릴 수 있다. 표·카드·차트에 숫자를 보여 주는 화면이면 아래를 본다.

| 코드 | 문제 | 예 | 기대 |
|---|---|---|---|
| A6-1 | 자리표시 기호만 있음 | `<td>—</td>`가 "대시"로 읽히거나 아무 소리도 나지 않음 | 기호는 `aria-hidden`, 옆에 sr-only 문장("값 없음" 등). 0과 미표기·데이터 부재를 서로 다른 문장으로 |
| A6-2 | 색만으로 증감·상태 표시 | 빨강/초록 숫자만으로 감소/증가 | 부호(+/−), 아이콘 + 텍스트, 또는 sr-only 문장 |
| A6-3 | 단위·통화가 시각 배치로만 연결 | 열 머리에만 `USD`, 셀은 `12.5M` | 표 헤더 셀(`th`) 연결 또는 셀 안 단위 표기. 카드형은 라벨-값을 `dl`·`aria-labelledby`로 묶음 |
| A6-4 | 툴팁·hover에만 있는 정보 | 기준일·출처가 hover 툴팁에만 있음 | 키보드 포커스로도 열리는 툴팁, 또는 본문 텍스트 |
| A6-5 | 차트에 대체 정보 없음 | 추이 차트만 있고 값 표·요약이 없음 | 차트 `role="img"` + 요약 aria-label, 또는 값 표·텍스트 요약 |
| A6-6 | 축약 표기를 읽는 방식 | `12.5M`이 "12.5 M"으로 읽힘 | 축약 자체는 허용. 단위가 모호하면(`B`가 billion인지 bytes인지) 화면 문맥이나 sr-only로 해결 |

스크립트는 A6-1만 자동으로 찾는다(자리표시 기호 목록 = 프로필 `a11y.placeholder_glyphs`). 나머지는 대표 화면에서 수동 표본으로 보고, 표본 수를 분모로 쓴다.

## 수동 확인

### 키보드 흐름 (standard 이상)

브라우저 스킬이나 감사 스크립트로 직접 확인하고 표로 남긴다. 해당 UI가 없는 흐름은 "해당 없음", 확인하지 못한 흐름은 `미검증`으로 쓴다.

| 흐름 | 기대 |
|---|---|
| 첫 Tab | skip link가 보이고 Enter로 실제 main에 포커스 이동 |
| 메뉴·계정 disclosure | Enter/Space로 열기, Escape로 닫고 트리거로 복귀, focus-out 시 닫힘 |
| 토글 그룹 필터 | 방향키 이동, Space 선택, 선택 상태가 `aria-checked`/`aria-pressed`로 노출 |
| 탭 | 방향키로 탭 이동, Tab으로 패널 진입 |
| 다이얼로그·드로어 | 열 때 내부로 포커스, Tab 순환, Escape로 닫고 트리거로 복귀 |
| 폼 오류 | 제출 실패 시 첫 오류 필드 또는 오류 요약으로 포커스, 메시지가 `aria-describedby`로 연결 |
| 스크롤 영역 | 이름 있는 focusable region, 키보드로 끝까지 스크롤 |
| 표·목록 행 이동 | 행 전체 클릭은 마우스 편의일 뿐, 행 안의 실제 링크로 같은 곳에 도달 |

### 스크린리더 표본 (full)

VoiceOver(macOS Safari) 또는 NVDA(Windows Chrome)로 대표 화면 하나씩. 제목 목록(rotor)으로 섹션 구조, 표 탐색으로 헤더 읽기, A6 표본 값(—, 0, 단위 붙은 금액), 로딩→완료 공지 횟수를 기록한다. 실행하지 못하면 `미검증: 실제 스크린리더`로 쓴다.

## 판정

심각도 예시다. P0/P1/P2를 게이트 판정으로 옮기는 기준(건수 임계값 포함)은 플러그인 루트 `references/issue-severity.md` §QA 판정 매핑을 따른다 — 이 문서는 임계값을 두지 않는다.

| 심각도 | 예 |
|---|---|
| P0 | 키보드 트랩, 핵심 기능(검색·필터·상세 이동·로그인 등)에 키보드로 도달 불가, 핵심 데이터에서 0과 미표기가 보조기기에서 같은 정보로 읽힘(A6-1) |
| P1 | 이름 없는 컨트롤, 라벨 없는 입력, 포커스 표시 없음·가려짐, 대비 미달, 320px 넘침, alt 없는 정보 이미지, 색만으로 상태 표시, 스켈레톤 노출, 로드 후 busy 잔류 |
| P2 | 제목 단계 건너뜀, skip link 위치, 양수 tabindex, 텍스트 간격 잘림(정보 손실 없음) |

**axe impact → 후보 심각도**: critical·serious → P1 후보, moderate·minor → P2 후보. P0는 위 표의 경우(트랩·핵심 기능 키보드 도달 불가·핵심 데이터 A6-1)에만 둔다. axe 결과는 노드를 확인하기 전까지 후보이며 결함 건수에 넣지 않는다. 확인하지 못한 P0 후보는 `unverified-risk`로 남긴다.

## 스캔 결과 읽는 법

- 정적 `A3-click-non-interactive`: 행 전체 클릭(`role="presentation"`)은 행 안에 같은 목적지의 링크가 있으면 결함이 아니다. 키보드 대체 경로를 확인한다.
- 정적 `A3-outline-none`: 프로필에 `a11y.global_focus_rule`(전역 `:focus-visible` 규칙)이 있으면 정적 규칙은 끄고 브라우저 A3 `포커스 표시 없음`으로만 판정한다.
- 브라우저 `포커스 가려짐`: 헤더 영역의 링크가 자기 sticky 헤더 안에 있으면 가림이 아니다. 스크립트는 포함 관계를 제외한다 — 다른 고정 층(쿠키 배너·채팅 버튼 등)에 가린 경우만 결함이다.
- 브라우저 `텍스트 간격 잘림`: 의도된 말줄임(`text-overflow: ellipsis` + 전체 텍스트 접근 가능)은 제외된다. 남은 후보는 정보가 사라지는지 화면으로 확인한다.
- skip link 판정 패턴은 프로필 `a11y.skip_link_pattern`(없으면 범용 기본값)이다. 프로젝트가 다른 문구를 쓰면 프로필에 넣는다.
