---
description: 성능 측정/최적화 — gstack benchmark 기반 성능 관리
argument-hint: <url> [--baseline | --trend]
---

# Pipeline: Performance

gstack benchmark를 활용한 성능 측정, 비교, 트렌드 분석입니다.

## Pre-flight

**`references/preflight-protocol.md` 참조.** 표준 프로토콜을 따릅니다.

차이점:
- gstack **필수** — 미설치 시 "gstack `/benchmark`가 필요합니다." 후 중단. (README에 명시됨)
- URL 없으면 config.md에서 확인, 없으면 AskUserQuestion.
- 모드: `--baseline` (캡처), `--trend` (트렌드), 없으면 비교 모드.
- Gotchas 중 `perf-regression`, `perf-baseline` 관련 항목을 벤치마크 컨텍스트로 전달.
- 트렌드 모드: `performance-*.md` **최근 20개만** 읽기 (수정 날짜 기준).

진행 추적 파일: `templates/performance-tracking.md` 기반으로 생성.

## 베이스라인 모드 (--baseline)

`/benchmark <url> --baseline` 실행.

## 비교 모드 (기본)

`performance-*.md` 중 `mode: baseline`, `status: completed` 파일 확인.
없으면 먼저 캡처할지 AskUserQuestion.
있으면 `/benchmark <url>` 실행.

## 트렌드 모드 (--trend)

최근 20개 `performance-*.md` 프론트매터에서 수치만 추출하여 시계열 구축.
`/benchmark --trend` 실행.

## 마무리

**`references/completion-protocol.md` 참조.** 표준 프로토콜을 따릅니다.

이 파이프라인의 Learnings 카테고리:
1. `perf-baseline:` — 베이스라인 수치 (LCP, FCP, CLS, 번들 사이즈)
2. `perf-regression:` — 이전 대비 악화 지표
3. `perf-improvement:` — 최적화 적용 후 개선 수치
