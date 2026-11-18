# 감사 리포트 템플릿 [L2]

`/bams:qa --audit` 결과를 `<run>/report.md`에 이 형식으로 쓴다. `<run>` = `.crew/artifacts/qa/{YYYY-MM-DD}-audit-{axes}[-n]/` — 원시 증거(`*.json`·`*.md`·`screens/`·`gallery.html`)와 같은 디렉터리.
판정 기준은 `../../../references/issue-severity.md` §QA 판정 매핑, 문장 규칙은 `../../../references/qa-principles.md` §2·§3. 아래 예시 값은 형식 설명용이다.

~~~~markdown
**판정: CONDITIONAL-GO** — Critical(P0) 0 / Major(P1) 3 / Minor(P2) 4 · 핵심 경로 미검증 0

# <화면/기능> 감사 리포트 (<YYYY-MM-DD>)

대표 결함: 상품 카드 대비 미달(P1), 검색 입력 라벨 없음(P1), 필터 닫은 뒤 포커스 유실(P1). 미검증: 로그인 세션 화면, server-cold API.

## 범위·환경

| 항목 | 값 |
|---|---|
| 모드 / 수준 | 감사 ALL(UI·A11Y·PERF) / standard |
| 분모 | UI 정적: 변경 파일 14개 · 브라우저: 라우트 6개 × viewport 2 = 측정 12회, 실패 0 · 검사 제외(HTTP ≥400) 0 · **표본 검증** |
| 핵심 경로 | `/`, `/items`, `/items/1` (사용자 지정 + diff 영향) — 미검증 0 |
| 서버 종류 | prod build (`next start` :3000) |
| 커밋 | `<short-sha>` (작업 트리 변경 없음) |
| 인증 | 없음(비로그인) — 로그인 화면은 미검증 |
| 캐시 계층 | API server-warm(server-cold 미검증: 캐시 우회 수단 없음) · 웹 browser-cold/warm/query-warm |
| viewport | 1440×1000, 390×844 |
| 실행 시각 | 2026-01-15T10:00Z |
| doctor | Playwright: bundle 1.x.y · chromium 실행 ok / axe: bundle 4.x.y |
| 프로필 | 없음 — 기본값, 건너뛴 규칙 3개(미검증) · 초안 `<run>/qa-profile.draft.json` |
| 프로젝트 검증 명령 | 없음(프로필 없음) — 프로필에 `project_checks`가 있으면 명령별 exit와 `<run>/project-checks.md` |

## 결과 요약

| 축 | 통과 | 결함 (P0 / P1 / P2) | 미검증 |
|---|---|---|---|
| UI | 정적 후보 확인 완료 · computed 12/12 측정 | 0 / 0 / 3 | 건너뛴 규칙 3 |
| A11Y | 자동 검사 위반 2건 · 키보드 흐름 7/8 | 0 / 3 / 1 | 실제 스크린 리더 |
| PERF | API 3/3 · 웹 6/6 측정 (예산 미정 — 기준선만) | 0 / 0 / 0 | server-cold API |

후보 → 결함: UI 정적 후보 21건 → 결함 3건 · 의도된 예외 16건 · 미확인 2건. A11Y 자동 검사 후보 5건 → 결함 3건 · 오탐 2건, 키보드 흐름 수동 확인 결함 1건.

## 결함

| # | P | issue-severity | 축·코드 | 위치 | 내용 | 증거 등급 | 증거 파일 | 제안 |
|---|---|---|---|---|---|---|---|---|
| 1 | P1 | Major | A11Y·A7 대비 | `/items` · 390 | 상품 카드 보조 텍스트 대비 3.1:1 | measured | `ui-computed.json`, `screens/_items__page__390.png` | 보조 텍스트 토큰을 한 단계 진한 값으로 |
| 2 | P1 | Major | A11Y·A2 이름 | `src/components/SearchBox.tsx:18` | 검색 입력에 접근 가능한 이름 없음(placeholder `Search`만) | measured | `a11y.json` | `<label>` 또는 `aria-label` 연결 |
| 3 | P1 | Major | A11Y·A3 키보드 | `/items` · 1440 | 필터를 Esc로 닫으면 포커스가 문서 처음으로 이동 | measured | 키보드 흐름 표(수동 확인) | 닫을 때 트리거로 포커스 복귀 |
| 4 | P2 | Minor | UI·U4 raw color | `src/components/ItemCard.tsx:42` | 토큰 대신 `#1a1a1a` 직접 사용 | inferred | `ui-static.json` | 텍스트 색 토큰 사용 |

## 접근성

자동 검사(axe·스크립트)와 수동 확인을 나눠 쓴다. "자동 검사 위반 0"을 "접근성 준수"로 쓰지 않는다.

- 자동: axe 실행(bundle 4.x.y) — 위반 2건(serious 1, moderate 1), incomplete 3건(수동 확인 대상). axe를 못 찾았으면 `axe: 미검증 (사유)`.
- 수동: 키보드 흐름 표.

| 흐름 | 기대 | 결과 | 증거 |
|---|---|---|---|
| 첫 Tab | skip link → main 포커스 | 통과 | `a11y.md` |
| 필터 열기 → Esc | 닫히고 트리거로 포커스 복귀 | 실패 — 포커스가 문서 처음으로 이동 (결함 #3) | 수동 확인 (Esc 동작은 스크립트 범위 밖) |

## 성능 기준선

조건: prod build, 로컬 :3000, API server-warm 30회 · 웹 3회 중앙값, viewport 2. 운영 수치·보장이 아니다. 예산 상태: **미정 — 판정 미사용(기준선만)**.

| 대상 | 모드 | p50 | p95 | 비고 |
|---|---|---:|---:|---|
| `/api/items?limit=50` | server-warm | 41 ms | 63 ms | Server-Timing `db` 중앙값 12 ms |
| `/items` | browser-cold | LCP 1.2 s | — | ready `[data-qa-field]` 1.4 s |

## 전후 비교

`<run>/gallery.html` — 전/후 × 1440·390. 이미지는 갤러리에 두고 이 리포트에는 경로만 쓴다.

## 의도 확인 요청

| 대상 | 관찰 | 질문 | 선택지 |
|---|---|---|---|
| `src/components/PromoBadge.tsx` | 공용 Badge와 모양이 같은 별도 컴포넌트 | 별도 컴포넌트가 의도인가? | (1) 공용 Badge로 통합 (2) 공용 Badge에 변형 추가 (3) 의도된 신규 — 사유 기록 |
| `/items` 빈 목록 | 재고 `0`과 데이터 없음이 같은 `0`으로 표시 | 두 상태를 구분해야 하나? | (1) 데이터 없음은 `—` + 설명 (2) 현재 유지 |

## 미검증·한계

(필수 — 없으면 "없음"이라고 쓴다)

- 로그인 세션 미사용 — 권한별 화면 차이 미검증.
- server-cold API 미검증 — 캐시 우회 수단 없음.
- 실제 스크린 리더 미사용 — 자동 검사·DOM 구조로만 확인.
- 건너뛴 규칙 3 (프로필 필드 없음): U2-bypass-wrapper, U2-banned-import, U3-duplicate-breadcrumb.
- UI 정적 후보 미확인 2건 — 결함 집계 제외.
- 제약으로 건너뜀: (해당 시) {단계} — {제약 출처}.

## 재현

```sh
# 명령마다 exit code. 쿠키 값은 적지 않는다(QA_COOKIE=<생략>).
node "$S/doctor.mjs" --out <run>                                                                                        # exit 0
node "$S/scan-ui-static.mjs" --repo . --out <run>                                                                       # exit 0
node "$S/inspect-computed-style.mjs" --base http://localhost:3000 --routes /,/items,/items/1 --out <run> --server prod   # exit 0
node "$S/audit-a11y.mjs" --base http://localhost:3000 --routes /,/items,/items/1 --out <run> --server prod               # exit 0
node "$S/measure-api.mjs" --base http://localhost:3000 --endpoints <run>/endpoints.json --out <run> --server prod         # exit 0
```
~~~~

## 작성 규칙

- **판정 줄은 첫 줄**이다. 판정, 건수(Critical/Major/Minor = P0/P1/P2), 핵심 경로 미검증 수만 쓰고 대표 결함은 아래 줄에 쓴다.
- 건수에는 **확인된 결함만** 넣는다. 확인 전 후보와 `unverified`는 넣지 않는다. 확인 못 한 P0 후보는 결함 표가 아니라 `미검증·한계`에 `unverified-risk`로 쓴다.
- 모든 축에 분모를 쓴다(`qa-principles.md` §5). 분모가 0이면 "검사 대상 없음"이지 "문제 없음"이 아니다.
- 결함 표의 위치는 `file:line` 또는 `route · viewport`. 증거 등급은 `measured`(브라우저·스크립트 관찰) 또는 `inferred`(코드 추적)로 쓰고, `guess`는 결함으로 올리지 않는다.
- 스크립트 후보 수와 확인된 결함 수를 한 문장으로 구분한다: "후보 N건 → 결함 a건 · 의도된 예외 b건 · 미확인 c건".
- 같은 원인의 결함은 하나로 합치고 축을 함께 적는다(예: `UI·U4 / A11Y·A7`).
- 의도 확인 요청에는 선택지를 2~3개 준다. 답을 받기 전에는 결함으로 세지 않는다.
- 범위·환경 표의 doctor·서버 종류·인증 칸을 비우지 않는다. 쿠키 값은 어디에도 쓰지 않는다. base URL은 스크립트 산출물처럼 origin + 경로로 쓰고 자격증명(`user:pw@`)·쿼리(`?`)·조각(`#`)을 넣지 않는다.
- 성능 표의 `unverified`(2xx 표본 0·HTTP ≥400 화면)·`error`(응답 없음) 행은 기준선 수치로 옮기지 않고 사유와 함께 `미검증·한계`에 쓴다.
- `미검증·한계`와 `재현`은 생략하지 않는다. 재현 명령은 실제로 실행한 그대로 적고 exit code를 붙인다.
