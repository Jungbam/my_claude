# Design Artifact Layout

> 템플릿 본문(preview/index.html·tokens.{css,ts,json} 골격·컴포넌트 문서)은 `design-artifact-templates.md`로 이관 — 해당 산출물 작성 시에만 Read.

## 개요

디자인 부서가 생성하는 모든 산출물은 `.crew/artifacts/design/{pipeline_slug}/` 하위에 표준 구조로 저장된다. 이 규칙은 다음을 보장한다:

- specialist 간 파일 경로 충돌 방지
- frontend-engineering 핸드오프 시 일관된 참조 경로
- `iterations/log.md` append-only 히스토리 보존
- 동일 파이프라인 재위임 시 멱등 덮어쓰기

## 디렉터리 구조

```
.crew/artifacts/design/{pipeline_slug}/
├── preview/
│   ├── index.html
│   ├── screens/{screen-id}.html
│   └── shared/
│       ├── components.html
│       └── styles.css
├── tokens/
│   ├── tokens.css
│   ├── tokens.ts
│   └── tokens.json
├── assets/
│   ├── icons/
│   └── illustrations/
├── spec/
│   ├── design-spec.md
│   └── creative-brief.md
└── iterations/
    ├── log.md
    └── iter-{N}-{viewport}.png
```

## 파일 명명 규칙

### screen-id

- 형식: **kebab-case**
- 영문 소문자와 하이픈만 사용
- 예시: `home`, `checkout-cart`, `user-profile`, `onboarding-step-1`

### 스크린샷 파일명

- 형식: `iter-{N}-{viewport}.png`
- `N`: iteration 번호 (1부터 시작, 패딩 없음)
- `viewport`: `mobile` (360px 기준) 또는 `desktop` (1280px 기준)
- 예시: `iter-1-mobile.png`, `iter-3-desktop.png`

### 기타 파일

| 파일 | 명명 규칙 |
|------|----------|
| `screens/*.html` | `{screen-id}.html` (kebab-case) |
| `assets/icons/*.svg` | `icon-{name}.svg` (kebab-case) |
| `assets/illustrations/*.svg` | `illust-{name}.svg` (kebab-case) |
| render 실패 기록 | `iter-{N}-render-failed.md` |

## 파일 크기 임계값

### SVG 인라인 금지 규칙 (R-6)

**SVG 파일 크기 4KB 초과 시 인라인 삽입 금지**. 반드시 외부 파일 참조 방식을 사용한다.

```html
<!-- 허용: 외부 파일 img 참조 -->
<img src="../assets/icons/icon-search.svg" alt="검색" width="24" height="24">

<!-- 허용: SVG use href 참조 (스프라이트 방식) -->
<svg aria-hidden="true"><use href="../assets/icons/sprite.svg#search"></use></svg>

<!-- 금지: 4KB 초과 SVG 인라인 직접 삽입 -->
<!-- <svg xmlns="http://www.w3.org/2000/svg" viewBox="...">...수백 줄...</svg> -->
```

**근거**: 인라인 SVG가 4KB를 초과하면 `preview/index.html` 총 크기가 빠르게 증가하고, 브라우저 렌더 성능과 코드 가독성이 저하된다. 4KB 미만의 단순 아이콘은 인라인 허용.

### preview/index.html 크기 권장

- 총 크기 **100KB 이하** 권장
- 초과 시 `screens/` 하위 별도 HTML로 분리

## 덮어쓰기 규칙

### 동일 pipeline_slug 재위임 시

동일한 `pipeline_slug`로 디자인 Phase가 재실행될 경우 **동일 디렉터리에 덮어쓰기**한다.

- `preview/`, `tokens/`, `assets/`, `spec/` 내 파일: 최신 결과로 덮어쓰기 (이전 버전 삭제)
- `iterations/log.md`: **append-only** — 절대 덮어쓰지 않는다 (히스토리 보존)
- `iterations/iter-*.png`: 동일 번호는 덮어쓰기 허용

### 멱등성

같은 입력으로 두 번 실행해도 동일한 결과가 나와야 한다. `log.md`만 예외적으로 누적 기록이 쌓인다.

## 경계 마커 규칙

specialist 간 충돌 방지를 위해 `preview/shared/styles.css`에는 **섹션 마커 주석**이 필수다.

### 마커 형식

```css
/* === UI === */
/* ui-designer 섹션 — 레이아웃, 컴포넌트 스타일, 반응형 */

/* === MOTION === */
/* motion-designer 섹션 — 트랜지션, 애니메이션, 마이크로인터랙션 */

/* === GRAPHIC === */
/* graphic-designer 섹션 — SVG 관련 스타일, 일러스트 포지셔닝만 */
```

### 섹션 소유권

| 마커 | 소유 specialist | 허용 속성 |
|------|----------------|----------|
| `/* === UI === */` | ui-designer | `layout`, `typography`, `color` 참조, `border`, `padding`, `margin`, `width`, `height`, `display`, `flex`, `grid` |
| `/* === MOTION === */` | motion-designer | `transition`, `animation`, `transform`, `@keyframes`, `@media (prefers-reduced-motion: ...)` |
| `/* === GRAPHIC === */` | graphic-designer | SVG `fill`, `stroke`, `clip-path`, illustration 포지셔닝만. 색상은 반드시 토큰 변수 참조 |

### Revise 단계 규칙

- 1 iteration당 **1 specialist만** 수정 (섹션 경계 간 교차 수정 금지)
- 수정은 자신의 섹션 마커 블록 내부로만 한정
- 타 섹션의 버그 발견 시: 해당 내용을 `iterations/log.md`에 기록하고 design-director에게 에스컬레이션 → 다음 iteration에서 해당 specialist가 수정
