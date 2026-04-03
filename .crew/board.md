# 태스크 보드

> Last updated: 2026-04-03T10:00:00+09:00

## Backlog

### REF-B4: 예산/비용 관리
**Feature**: ref-analysis-paperclip | **Wave**: 4 | **Priority**: medium | **Size**: M
**담당 부서장**: backend-engineering
**Description**: 에이전트별 토큰 사용량을 추적하고, 스코프별(에이전트/파이프라인/전체) 예산 제한과 경고를 구현한다. `token_usage`, `budget_policies` 테이블을 SQLite DB에 추가하고, 파이프라인 완료 시 비용 요약을 생성한다.
**deps**: REF-B2 (동일 DB), REF-C1 (API 경유 비용 기록)

### REF-C1: Control Plane 서버
**Feature**: ref-analysis-paperclip | **Wave**: 3 | **Priority**: high | **Size**: XL
**담당 부서장**: platform-devops
**Description**: `bams-server` Bun HTTP 서버를 `plugins/bams-plugin/server/`에 구현한다. bams-viz의 파일 직접 읽기를 REST API로 대체하고, B2 DB를 API로 노출한다. 기본 포트 3099. SSE 엔드포인트 포함.
**deps**: REF-B2 (API가 읽을 DB)

### REF-C2: 실시간 실행 뷰어
**Feature**: ref-analysis-paperclip | **Wave**: 4 | **Priority**: medium | **Size**: L
**담당 부서장**: frontend-engineering
**Description**: 에이전트 실행 중 stdout을 bams-viz에 실시간 스트리밍한다. C1 서버의 SSE 엔드포인트를 활용하여 tool_call, tool_result, text_chunk, error 이벤트를 bams-viz "실행 뷰어" 탭에 표시한다.
**deps**: REF-C1 (SSE 엔드포인트), REF-B2 (태스크 ID 연결)

## In Progress

### REF-A1: 에이전트 메모리 시스템 (PARA)
**Feature**: ref-analysis-paperclip | **Wave**: 1 | **Priority**: high | **Size**: XL
**담당 부서장**: platform-devops
**Description**: 20개 에이전트 각각에게 `.crew/memory/{agent-slug}/` 디렉터리를 할당하고, Tiago Forte의 PARA 구조(projects/, areas/, resources/, archives/, memory/YYYY-MM-DD.md, MEMORY.md)를 적용한다. 에이전트 AGENTS.md에 메모리 로드/저장 절차를 명시하고, 파이프라인 시작/완료 시 메모리 연동 프로토콜을 구현한다.
**deps**: 없음 (독립 구현 가능)

### REF-A2: 문서 Drift 자동 감지
**Feature**: ref-analysis-paperclip | **Wave**: 1 | **Priority**: high | **Size**: M
**담당 부서장**: backend-engineering
**Description**: `doc-drift` 스킬을 `.crew/skills/doc-drift/SKILL.md`에 구현한다. `git log` 기반 커서(`.doc-review-cursor`) 방식으로 마지막 검토 이후 변경사항만 분석하고, drift 발견 시 브랜치 생성 + 최소 편집 + PR 자동 생성한다. 감시 대상: CLAUDE.md, README.md, .crew/config.md, plugins/bams-plugin/SKILL.md.
**deps**: 없음 (독립 구현 가능)

### REF-A3: Org 포터빌리티 (export/import)
**Feature**: ref-analysis-paperclip | **Wave**: 1 | **Priority**: high | **Size**: M
**담당 부서장**: platform-devops
**Description**: `/bams:export`와 `/bams:import` 커맨드를 구현한다. export 패키지(`bams-org-{timestamp}.tar.gz`)에 agents/, skills/, references/, config.md, gotchas.md, delegation-protocol.md를 포함하고 MANIFEST.md를 생성한다. agentcompanies/v1 스펙 호환 COMPANY.md 자동 생성.
**deps**: 없음 (독립 구현 가능)

### REF-B2: DB 기반 태스크 관리
**Feature**: ref-analysis-paperclip | **Wave**: 1-2 | **Priority**: high | **Size**: L
**담당 부서장**: backend-engineering
**Description**: SQLite DB(`.crew/db/bams.db`)에 `tasks`와 `task_events` 테이블을 구현한다. Paperclip `issues` 테이블 패턴을 참조하여 atomic checkout(`UPDATE ... WHERE status='backlog'`)을 구현하고, board.md 마이그레이션 스크립트를 작성한다. Bun 네이티브 sqlite API 사용.
**deps**: 없음 (SQLite 직접 접근으로 C1 없이 선행 구현)

## In Review

## Done

### VIZ-001: Next.js 프로젝트 초기화 + 기반 구조
**Feature**: viz-nextjs-rebuild | **Completed**: 2026-04-02

### VIZ-002: lib/ TypeScript 전환 + EventStore 구현
**Feature**: viz-nextjs-rebuild | **Completed**: 2026-04-02

### VIZ-003: API Route Handler 마이그레이션
**Feature**: viz-nextjs-rebuild | **Completed**: 2026-04-02

### VIZ-004: AppShell + TabNav + 기존 탭 마이그레이션
**Feature**: viz-nextjs-rebuild | **Completed**: 2026-04-02

### VIZ-005: Timeline/Logs 탭 재구현 (FR-4)
**Feature**: viz-nextjs-rebuild | **Completed**: 2026-04-02

### VIZ-006: Traces 탭 + Trace API (FR-2)
**Feature**: viz-nextjs-rebuild | **Completed**: 2026-04-02

### VIZ-007: Metaverse 탭 (FR-3)
**Feature**: viz-nextjs-rebuild | **Completed**: 2026-04-02

### VIZ-008: hooks 스키마 확장
**Feature**: viz-nextjs-rebuild | **Completed**: 2026-04-02
