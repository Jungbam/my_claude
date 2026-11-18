# UI 디자인 시스템 감사 (U1–U7) [L2]

> `/bams:qa --audit ui` 단계에서 읽는다. 관찰 전용 — 수정은 사용자 요청 시 `/bams:hotfix`·`/bams:dev`.
> 표기: `$S` = 감사 엔진 스크립트 디렉터리(SKILL §실행 환경에서 설정), `<run>` = `.crew/artifacts/qa/<YYYY-MM-DD>-<scope>`.

UI 감사는 세 단계로 나눈다. 세 단계를 모두 거쳐야 UI 축을 마쳤다고 쓴다. 거치지 못한 단계는 `미검증`으로 남긴다.

| 단계 | 방식 | 근거 | 이 문서 |
|---|---|---|---|
| ① 자동 | 감사 스크립트(정적 스캔·computed style) + 프로필 `project_checks`(대상 레포 자체 검증 명령, 직렬) | 스크립트 출력·명령 + exit | §실행, §단계 U1–U7 |
| ② 사람 판단 | 화면과 코드를 보고 스크립트가 못 잡는 것을 확인 | 확인 표 + 실측값 | §수동 확인 |
| ③ 표기 대조 | 프로필 `notation_rules`의 `scope` 화면 문구를 원문 출처와 대조 | 규칙별 대조 화면 수·불일치 수 | 프로필 문서 `qa-profile.md` §`notation_rules` |

`notation_rules`가 비어 있으면 ③은 생략하고 `미검증·한계`에 적는다. 프로젝트별 판정 기준(디자인 시스템 카테고리·프로세스 제약)은 대상 레포 `.crew/qa-profile.md`에 두고, 이 문서는 범용 절차만 다룬다.

디자인 시스템 준수는 **정적 스캔(코드)** 과 **브라우저 측정(computed style)** 두 층으로 본다. 코드에 토큰 클래스를 썼어도 그 토큰이 정의되지 않았거나 잘못된 변수를 가리키면 브라우저에서는 배경이 투명해지거나 부모 값이 상속된다. 한 층만 보고 "준수"라고 쓰지 않는다.

**판정 기준 문서**는 프로젝트 QA 프로필 `design_docs`가 가리키는 대상 레포 문서다. 프로필 `.crew/qa-profile.json`은 스캔용 기계 판독 값, `.crew/qa-profile.md`(선택)는 사람이 읽는 판정 기준 요약이다.

- `design_docs`가 비어 있으면 기준 문서 없이 프로필·기본값 규칙만으로 본다. 기준 문서가 있어야 하는 판정(위계·역할 표 등)은 `미검증`으로 남긴다.
- 기준 문서가 프로필보다 새로우면 프로필 갱신을 사용자에게 제안한다(승인 없이 프로필을 쓰지 않는다).

## 실행

```sh
# 정적: 기본 범위 = base...HEAD 변경 파일 + 작업 트리. 저장소 전체는 --all
node "$S/scan-ui-static.mjs" --repo . --profile .crew/qa-profile.json \
  --base origin/main --out <run>

# 브라우저: 변경 컴포넌트를 소비하는 라우트
node "$S/inspect-computed-style.mjs" --profile .crew/qa-profile.json \
  --base http://localhost:3000 --routes /,/products,/products/1 \
  --viewports 1440x1000,390x844 --server dev --out <run>
```

- 프로필이 없으면 `--profile`을 빼고 실행한다. 기본값으로 돌고, 프로필 필드가 없어 끈 규칙은 `ui-static.json`의 `skipped_rules`와 md의 "건너뛴 규칙(미검증)" 표에 남는다. 리포트는 이 규칙들을 `미검증`으로 옮긴다.
- `--base`(정적)를 생략하면 기본 브랜치를 자동 감지한다(프로필 `base_branch`가 있으면 그 값). 값은 ref 이름만(영문·숫자·`._/@-`, `-`로 시작·`..` 포함 불가) — 위반이나 커밋으로 해석되지 않는 ref는 exit 2. 비ASCII 파일명도 그대로 스캔한다.
- `scan-ui-static`의 stdout은 요약(규칙별 건수·산출물 경로)뿐이다. 목록은 `ui-static.md`·`ui-static.json`에서 읽는다.
- `inspect-computed-style`은 HTTP ≥400 페이지를 검사하지 않는다 — 행에 `HTTP n — 정상 UI 검사 제외`로 남고 모든 검사 칸은 `-`다. md 요약 줄(`검사 N / 검사 제외(HTTP ≥400) M / 오류 K`)과 json `summary`의 `skipped_http`를 분모에서 따로 센다.
- `--server dev|prod|staging|unknown`을 적는다(리포트 범위·환경 표에 그대로 쓴다).
- localhost/127.0.0.1/::1 외 호스트는 사용자가 명시했을 때만 `--allow-remote`를 붙인다.
- full 수준은 `--viewports 1440x1000,1024x900,768x1000,390x844,320x800`.
- 키보드·스크린리더·자동 접근성 검사는 A11Y 축(`a11y-audit.md`)이 맡는다.

산출물: `<run>/ui-static.{json,md}`, `<run>/ui-computed.{json,md}`.

## 단계

| 단계 | 확인 | 스크립트 규칙 / 측정 | 기본 심각도 | 프로필 필드 없으면 미검증 | 판정 |
|---|---|---|---|---|---|
| U1 인벤토리 | 신규·변경 컴포넌트와 그것을 소비하는 라우트 | git diff (`scan-ui-static` 변경 파일 목록) | — (범위 결정) | — (`base_branch` 없으면 자동 감지) | 소비 라우트를 브라우저 측정 대상에 넣는다 |
| U2 Primitive | 탭 컴포넌트는 실제 탭-패널 구조에만, 결과를 바꾸는 필터는 토글 그룹. disclosure·모달은 프로젝트 래퍼 사용. 금지 라이브러리 import 없음. 버튼 기본 `type="button"`, 제출만 `type="submit"`, 이동은 링크 | `U2-tabs-without-panel`, `U2-banned-import`, `U2-bypass-wrapper`, `U2-button-no-type`, `U2-submit-type` | P1(래퍼 우회·금지 import·폼 안 의도치 않은 제출) / P2(그 밖의 type 누락) | `banned_imports` → U2-banned-import · `ui_wrappers` → U2-bypass-wrapper · `ui_dir` → U2 탭 래퍼 판정 | 래퍼 우회는 래퍼가 그 기능을 지원하는지 확인한 뒤 판정 |
| U3 중복 컴포넌트 | `ui_dir` 컴포넌트와 기능이 겹치는 신규 컴포넌트 | 이름·props·JSX·스타일 유사도(`duplicate_threshold`), `U3-duplicate-breadcrumb`, `U3-raw-table` | P1(재사용·확장 가능) / 기록만(정당한 신규) | `ui_dir` → U3 전체. breadcrumb·table 규칙은 `ui_dir`에 `breadcrumb*`·`table*` 파일이 있을 때만 | 아래 판정 절차 |
| U4 컬러 | 역할 토큰만 사용, 원시 hex/rgb 금지(허용 경로 제외), 정의되지 않은 변수·토큰 클래스 금지, 색만으로 상태 표시 금지 | `U4-raw-color`, `U4-undefined-var`, `U4-unknown-token-class`, `U4-palette-class` + 브라우저 `transparent_token_bg` | P1(미정의 토큰으로 렌더가 깨짐) / P2(원시 색·팔레트 클래스) | `token_definition_files` 비면 CSS 사용자 정의 속성 정의 줄(`--x: #hex`)은 U4-raw-color에서 제외 · `runtime_vars` → U4-undefined-var 예외 · `raw_color_allowed` → 예외 경로 | 미정의 토큰은 실제 렌더 결과(투명·상속)를 브라우저로 확인 |
| U5 타이포 | 역할 클래스 사용, 임의 크기 금지, 페이지당 H1 하나, 숫자 열은 고정폭 숫자 | `U5-arbitrary-type`, `U5-inline-font-size`, `U5-multiple-h1` + 브라우저 `role_mismatch`, `off_scale` | P2 | `typography` → role_mismatch · `extra_font_sizes_px` → off_scale | computed 크기·행간·굵기가 역할 표와 다르면 덮어쓴 곳을 찾는다 |
| U6 컴포넌트 위계 | 페이지 셸 순서(컨테이너 → breadcrumb → 페이지 헤더 → 섹션 → 카드·표). 상위 셸이 간격을 소유하면 내부는 간격을 다시 주지 않음. 영역당 주 CTA 하나 | `U6-arbitrary-spacing` + 스크린샷 | P2 | `page_structure` → 위계 판정(간격 스캔은 실행) | 중복 여백·외곽 폭 차이는 박스 좌표로 확인 |
| U7 대비·반응형 | 대비(본문·큰 글자·컨트롤/포커스), 모바일 터치 대상 크기, viewport별 가로 넘침 없음, pageerror 없음 | 브라우저 `contrast_fail`, `small_targets`, `overflow` | P1 | 없음 — `contrast`·`target_size_px`·`mobile_breakpoint_px`는 기본값으로 실행 | 같은 측정값을 A11Y의 A7로도 쓴다. 한 결함은 리포트에 한 번만 싣는다 |

기본 심각도는 출발점이다. 영향 범위(핵심 경로 여부, 정보 손실 여부)를 보고 조정하고, 조정 사유를 결함 행에 쓴다. P0/P1/P2를 게이트 판정으로 옮기는 기준은 플러그인 루트 `references/issue-severity.md` §QA 판정 매핑을 따른다 — 이 문서는 임계값을 두지 않는다.

### U3 중복 컴포넌트 판정

1. `ui-static.md`의 후보마다 신규 파일과 후보 `ui_dir` 파일을 나란히 읽는다.
2. 다음 중 하나로 분류한다.
   - **재사용 가능**: 기존 컴포넌트의 props로 같은 결과가 나온다 → P1, 교체 제안
   - **기존 확장 필요**: variant·prop 하나를 추가하면 된다 → P1, 확장 제안
   - **정당한 신규**: 의미·상호작용이 다르다 → 결함 아님, 기존과 다른 점 한 줄 기록
3. 유사도 점수가 낮아도 이름에 `Badge/Chip/Tag/Pill/Card/Table/Tabs/Skeleton/Breadcrumb/Tooltip/Dialog/Drawer`가 들어간 신규 파일은 `ui_dir` 카탈로그를 직접 훑는다.

**병합 후 `--all` sweep 분류** — 작업 중 감사는 변경 파일만 본다. 여러 작업이 기준 브랜치에 병합된 뒤에는 `scan-ui-static --all`로 페이지 전체의 공용 컴포넌트 밖 요소(비-DS 요소)를 훑고 다음 둘로 나눈다. 이 결과는 기존 부채 목록이며 판정 건수에 섞지 않는다(§스캔 결과 읽는 법).

- **(a) 교체 가능** — 대응하는 공용 컴포넌트가 있다 → 교체안(어느 컴포넌트·어느 props)을 쓴다.
- **(b) 신규 필요** — 대응하는 공용 컴포넌트가 없고 여러 곳에서 반복된다 → **승격 후보**로 올린다. 공용 컴포넌트 추가·기존 공용 컴포넌트 수정은 감사자가 정하지 않고 리포트 `## 의도 확인 요청`에 선택지와 함께 올린다.

## 수동 확인

스크립트가 판정하지 못하는 항목이다. 화면·코드를 보고 확인한 뒤 결과를 표로 남긴다(확인한 화면 수 / 해당 수). 확인하지 못한 항목은 `미검증`.

| 확인 항목 | 보는 것 | 결과에 쓰는 것 |
|---|---|---|
| 공통 컴포넌트 사용 | 비슷한 UI를 공용 컴포넌트 대신 직접 만들었는가 | 위치 + 대응 공용 컴포넌트(없으면 승격 후보) |
| 의도된 차이의 근거 | 기준 문서·공용 컴포넌트와 다른 부분에 의도를 밝힌 주석(작업·날짜·의도·영향 범위)이 있는가 | 주석 위치. 주석이 없으면 의도 확인 요청으로 올리고, 대상 레포 의도 원장(`.crew/qa-intent-ledger.md`) ①에 결정이 있으면 그 결정을 따른다 |
| 대비 | 읽히는가 — "충분함" 대신 측정한 대비 값 | 요소·전경/배경 색·대비 값(`ui-computed`·`a11y` 측정값 또는 수동 측정) |
| 글자 크기 하한·줄바꿈 | 프로젝트가 정한 최소 글자 크기 아래로 내려간 텍스트, 어절·단어 중간 줄바꿈 | 요소·computed 크기·viewport. 하한·줄바꿈 규칙은 대상 레포 `.crew/qa-profile.md`가 정한다(없으면 `미검증`) |

## 전후 비교

수정 전후 비교는 숫자로 쓴다 — 전후 캡처 픽셀 비교(`build-gallery`, 차이 0이면 등가), 폭별 computed 값(크기·비율), 가로 넘침(문서 폭 − 화면 폭), 동작 후 상태(클릭·키보드 입력 뒤 URL·화면 상태).

## 스캔 결과 읽는 법

- 정적 스캔은 Tailwind 클래스·CSS 변수 중심의 **정규식 근사**다. 문자열 안 색상, 동적으로 조합한 클래스, 조건부 렌더는 놓치거나 오탐할 수 있다. 다른 스타일링 방식이면 `skipped_rules`가 늘어난다.
- 모든 스크립트 결과는 **후보**다. 코드(`file:line`)를 열거나 화면으로 확인한 뒤에만 결함으로 올린다(`references/qa-principles.md` §3). 리포트에는 "후보 N건 중 확인 결함 M건, 의도된 예외 K건"으로 쓴다.
- 발견 목록은 파일·규칙당 60건까지만 나열된다. 초과분은 md에 `외 N건` 행, json `truncated`(`omitted`·`by_rule`·`by_file`)로 남는다 — 후보 수는 규칙별 건수(생략분 포함)로 쓴다.
- **판정은 변경 파일 결과만** 쓴다. `--all` 전체 스캔은 기존 부채를 보여 주는 참고 자료로만 첨부하고 건수에 섞지 않는다.
- 허용 예외(차트 시리즈 색, 지도·Canvas, 외부 원문 임베드, 이메일 HTML, OG 이미지 등)는 프로필 `raw_color_allowed`에 둔다. 새 예외는 사용자 확인 후 프로필에 추가한다 — 감사 중에 프로필을 임의로 넓히지 않는다.
- 브라우저 측정은 `--ready <selector>`가 보인 뒤 값을 읽는다. 스켈레톤 상태의 computed 값은 U 판정에 쓰지 않는다(스켈레톤은 `perf-audit.md` P6).
