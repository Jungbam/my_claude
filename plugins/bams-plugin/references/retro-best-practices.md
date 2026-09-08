# Retro Best Practices

> 작성일: 2026-04-04 (2026-09 정성 회고 전환 반영)
> 적용 범위: `/bams:retro` 파이프라인 전 Phase (3 Phase — 회고 KPT / 개선 / 보고)

---

## Good Practices — 검증된 패턴

### Phase 1: KPT 회고

**정성 입력 소스만 사용**

회고는 정량 이벤트 로그를 사용하지 않는다. 다음 정성 소스만 입력으로 사용한다:
- `.crew/history.md` — 대상 파이프라인 완료 기록(slug, type, status, 산출물, 요약)
- `.crew/artifacts/{prd,design,review,report}/` — 대상 파이프라인 산출물
- 사용자 관찰·피드백

**KPT 일반화 가능성 분류 필수**

각 Problem에는 "다중 프로젝트 재현 가능 / 단일 프로젝트 한정" 분류를 반드시 표시한다. 단일 프로젝트 한정 항목은 plugin `agents/*.md` 수정 대상이 아니라 `.crew/gotchas.md` 후보로 분류한다(`retro-protocol.md` §3-0/3-1).

### Phase 2: 개선 실행

**개선 대상은 KPT Problem 기준으로 선정**

개선 대상 에이전트는 `phase2-kpt-consolidated.md`의 Problem 항목에서 명시적으로 지목된 에이전트로 선정한다(정성 기반). 정량 등급이 아니라 KPT 근거로 판단한다.

**교훈은 MEMORY.md, 일반 규칙만 정의 파일**

승인된 개선안을 hr-agent가 적용할 때, 교훈은 `.crew/memory/{agent-slug}/MEMORY.md`에 기록하고, 항구적 일반 규칙만 `agents/*.md`·`references/*.md`에 회고 슬러그·날짜·경로·KPT 인용 없이 1~3줄 일반 규칙 문장으로 반영한다.

### Phase 3: 보고

**보고서 작성 주체는 product-analytics**

종합 보고서는 product-analytics(평가 부서장)가 정성 근거 기반으로 작성한다. 파이프라인 수 표기 형식을 통일한다: `분석 대상: {N}개 파이프라인` (history.md 기준).

### Slug 네이밍

retro 파이프라인의 slug는 `retro_{SCOPE_KR}_{N}` 형식을 따른다:

| TARGET_SCOPE | SCOPE_KR | slug 예시 |
|--------------|----------|-----------|
| all | 전체회고 | retro_전체회고_1 |
| recent5 | 최근5회고 | retro_최근5회고_1 |
| since_7d | 최근7일회고 | retro_최근7일회고_1 |
| slug:feature_xxx | feature_xxx회고 | retro_feature_xxx회고_1 |

같은 scope로 여러 번 실행하면 순번(`_1`, `_2`, ...)이 자동 증가한다.

---

## Bad Practices — 반복 발생 문제

### 보고서 형식 불일치

**문제**: 회고마다 파이프라인 수 표기 형식이 달랐음 (`분석 파이프라인: 12개` vs `총 파이프라인 수: 12`).

**결과**: 이전 보고서와 비교 시 파싱 실패. 트렌드 정성 비교 불가.

**예방**: Phase 3 보고서 섹션에 표준 형식 명시. `분석 대상: {N}개 파이프라인` 형식 통일.

### KPT Problem에 Try 미연결

**문제**: Problem만 나열하고 대응 Try를 연결하지 않음.

**결과**: 개선 Phase에서 개선 대상 선정 불가.

**예방**: 모든 Problem에 최소 1개의 Try를 연결하도록 Phase 1 게이트에서 확인.

### 단일 프로젝트 한정 이슈를 plugin 규칙에 반영

**문제**: 현재 프로젝트 스택/도메인 한정 이슈를 plugin `agents/*.md` 행동 규칙으로 승격.

**결과**: 다른 프로젝트에서 의미 없는 규칙으로 오염.

**예방**: 일반화 가능성 분류에서 "단일 프로젝트 한정"은 `.crew/gotchas.md` 후보로만 처리(R4 가드).
