# 프로젝트 설정

> Last updated: 2026-04-06

## 프로젝트 개요

| 항목 | 값 |
|------|-----|
| 이름 | gstack (Garry's Stack) |
| 버전 | v0.11.17.0 |
| 설명 | Claude Code skills + fast headless browser. AI 엔지니어링 워크플로우 플랫폼 |
| 런타임 | Bun >= 1.0.0 |
| 언어 | TypeScript, Python, Markdown, JSON |
| 라이선스 | MIT |

## 아키텍처

### 컴포넌트

| 컴포넌트 | 경로 | 런타임 | 포트 |
|----------|------|--------|------|
| gstack core | `/` | Bun | - |
| bams-plugin | `plugins/bams-plugin/` | Bun | - |
| browse | `browse/` | Playwright + Bun | 3000 |

### 에이전트 조직 (8부서 35에이전트)

위임 체계 (2단 위임): `사용자 커맨드 → 부서장 → (선택적) 도메인 에이전트`
pipeline-orchestrator는 계획/게이트 판정을 반환하는 조언자(Advisor) 모드로 동작 (Task tool 직접 호출자 아님).

- 기획부: product-strategy(장), business-analysis, ux-research, project-governance
- 개발(FE): frontend-engineering(장, 직접 구현)
- 개발(BE): backend-engineering(장, 직접 구현)
- 개발(인프라): platform-devops(장), data-integration
- 디자인부: design-director(장), ui-designer, ux-designer, graphic-designer, motion-designer, design-system-agent, guide-decomposer, guide-recomposer, ui-diff-applier, data-binding-mapper, visual-fidelity-verifier, nextjs-convention-mapper, accessibility-auditor, routing-strategist, ssr-csr-decider
- QA부: qa-strategy(장), automation-qa, defect-triage, release-quality-gate
- 평가부: product-analytics(장), experimentation, performance-evaluation, business-kpi
- 경영지원(독립 운영): resource-optimizer, hr-agent, cross-department-coordinator

### 데이터 경로

- 아티팩트: `.crew/artifacts/` (PRD, 설계 문서, 리뷰, 회고)
- 태스크 상태: `.crew/board.md` / 파이프라인 히스토리: `.crew/history.md`

## 컨벤션

### TypeScript
- ESM (`"type": "module"`)
- `bun build --compile`로 단일 바이너리 생성
- DB: bun:sqlite 네이티브 (ORM 없음, raw SQL)
- 서버: `Bun.serve()` — Express/Fastify 없음
- `SKILL.md`는 `.tmpl` 템플릿에서 자동 생성 — 직접 편집 금지

### Git
- 커밋: 단일 논리적 변경 단위로 bisect
- `browse/dist/` 바이너리 커밋 금지
- `git add .` 사용 금지 — 파일명 개별 명시
- 파이프라인 슬러그: `{command}_{한글요약}` (immutable)

### 테스트
- 3-tier: 무료(`bun test`) / LLM eval / E2E (`claude -p`)
- Diff 기반 선택: `touchfiles.ts` 의존성 선언
- Gate/Periodic 분류: CI는 gate만, periodic은 주간 cron

## 배포 상태

- CI/CD: 미설정 (GitHub Actions 워크플로우 부재)
- 배포 방식: 로컬 수동 (`./setup`)
- 컨테이너화: 미구성

## 외부 서비스

- Anthropic Claude API (에이전트 실행, 테스트 전용)
- Playwright/Chromium (브라우저 자동화)
- OpenAI Codex CLI (세컨드 오피니언)
- GitHub CLI (PR/이슈 관리)
- SQLite (Bun 네이티브, 로컬 영구 저장)
- SEC EDGAR / GCS (금융 데이터)

## 주요 커맨드

```bash
bun install          # 의존성 설치
bun test             # 무료 테스트 (<2s)
bun run test:evals   # 유료 eval (diff 기반, ~$4/run)
bun run build        # SKILL.md 생성 + 바이너리 컴파일
bun run gen:skill-docs  # SKILL.md 재생성
bun run dev <cmd>    # CLI dev 모드
```
