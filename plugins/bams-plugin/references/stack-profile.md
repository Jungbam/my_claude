# 기술 스택 프로파일 (Stack Profile)

> 개발 계열 에이전트(frontend-engineering, backend-engineering, platform-devops, data-integration, qa-strategy, automation-qa)가 위임 수신 시 참조하는 기술 스택 기본값 단일 진실 소스(SSOT).
> 목적: 개발 계열 프롬프트가 스택 무관(generic)으로 설계되어 있어 매번 컨벤션을 재발견하는 낭비를 줄인다. 사용자는 대부분 TypeScript/Next.js(App Router)로 개발하고 가끔 Python/Go를 사용한다.

## 스택 판별 우선순위

작업 시작 전 다음 순서로 스택을 판별한다:

1. **1순위 — 프로젝트 설정**: 대상 프로젝트의 `.crew/config.md`에 스택/컨벤션이 정의되어 있으면 그것을 그대로 따른다.
2. **2순위 — 자동 감지**: 프로젝트 파일로 스택을 추론한다.
   - `next.config.*` 또는 `package.json`의 `dependencies`/`devDependencies`에 `"next"` → Next.js
   - `pyproject.toml` 또는 `requirements.txt` → Python
   - `go.mod` → Go
3. **3순위 — 기본값**: 위 두 단계로 판별 불가하면 **TypeScript + Next.js App Router** 프로파일을 가정한다.

**충돌 시 원칙**: 위 우선순위와 무관하게, 프로젝트의 실제 코드 관례(기존 파일 패턴, lint 설정, 기존 컴포넌트 구조)가 항상 이 문서보다 우선한다. 이 문서는 관례가 아직 확립되지 않았을 때의 기본값이다.

## 기본 프로파일: TypeScript / Next.js (App Router)

- **컴포넌트 경계**: Server Component가 기본. `'use client'`는 상호작용(이벤트 핸들러/훅/브라우저 API)이 필요한 leaf 컴포넌트에만 최소 적용한다. 경계가 애매하면 서버 우선으로 판단한다.
- **데이터 페칭**: 서버는 RSC 내 `async fetch`를 사용하며 캐시 전략(`revalidate`/태그)을 명시한다. 클라이언트는 프로젝트가 이미 쓰는 라이브러리(TanStack Query/SWR) 관례를 따른다. 서버↔클라이언트 이중 페칭은 금지한다.
- **변이(mutation)**: 폼 제출이나 단순 변이는 Server Action을 사용하고, 외부 노출이 필요하거나 폼이 아닌 API는 Route Handler(`app/api/**/route.ts`)를 사용한다. 판단 기준: 이 요청이 폼 제출인가(Server Action) 아니면 독립적으로 호출되는 API 엔드포인트인가(Route Handler).
- **파일 컨벤션**: `page.tsx`/`layout.tsx`/`loading.tsx`/`error.tsx`/`not-found.tsx` 특수 파일, route group `(name)`, dynamic segment `[param]`을 표준으로 사용한다. DB/시크릿 접근 코드는 서버 전용 모듈로 격리한다(`server-only` import 또는 `*.server.ts` 네이밍).
- **타입**: `strict: true` 전제. `any` 사용 금지(불가피한 경우 `unknown` + narrowing으로 대체). 외부 경계(API 입출력, env 변수, 폼 입력)는 zod 등으로 런타임 검증한다.
- **스타일/UI**: Tailwind CSS + shadcn/ui 관례가 기본. 하드코딩 색상/치수 대신 디자인 토큰(CSS 변수)을 참조한다. 이미지는 `next/image`, 폰트는 `next/font`를 사용한다.
- **환경변수**: 클라이언트에 노출되는 변수는 `NEXT_PUBLIC_` prefix만 사용한다. 시크릿(API 키, 토큰)에 `NEXT_PUBLIC_`를 부여하는 것은 절대 금지한다. `.env.local`은 커밋하지 않는다.

## 표준 검증 명령 (Next.js/TS)

| 단계 | 기본 명령 | 비고 |
|------|-----------|------|
| typecheck | `bunx tsc --noEmit` | npm 프로젝트면 `npx tsc --noEmit` |
| lint | `bun run lint` | — |
| build | `bun run build` | — |
| unit | `bun test` 또는 `bunx vitest run` | 프로젝트가 채택한 러너 우선 |
| E2E | `bunx playwright test` | — |

**우선순위**: `package.json` scripts에 정의된 명령이 항상 위 기본값보다 우선한다. 패키지 매니저는 lockfile로 감지한다(`bun.lock` → bun, `pnpm-lock.yaml` → pnpm, `package-lock.json` → npm).

## 보조 프로파일

### Python

`uv`/`venv` 기반 가상환경 관례를 따른다. 테스트는 `pytest`, lint는 `ruff check`, 타입체크는 `mypy`를 기본으로 하되 프로젝트 설정(`pyproject.toml`)이 있으면 그것을 우선한다.

### Go

빌드는 `go build ./...`, 테스트는 `go test ./...`, lint는 `golangci-lint run`을 기본으로 한다. 표준 Go 프로젝트 레이아웃(`cmd/`, `internal/`, `pkg/`)을 준수한다.

## QA 기본값

테스트 피라미드는 다음 순서로 우선한다:

1. **단위 테스트**: `vitest`/`bun test` + Testing Library, role 기반 쿼리(`getByRole` 등)를 우선 사용
2. **통합 테스트**: Route Handler/Server Action을 직접 호출하여 검증
3. **E2E 테스트**: Playwright

**제약**: RSC(async Server Component)는 단위 렌더 테스트가 불가능하므로 통합 테스트 또는 E2E로 검증한다.
