---
description: 5관점 병렬 코드 리뷰 + 릴리스 품질 게이트
argument-hint: [파일, 디렉토리, 또는 "pr"]
---

# Bams Review

Bams 오케스트레이터로서 5개 전문 병렬 qa-strategy 에이전트를 활용한 다관점 코드 리뷰를 실행하고, release-quality-gate 에이전트로 최종 판정합니다.

리뷰 대상: $ARGUMENTS

## 코드 최신화

Bash로 `git rev-parse --is-inside-work-tree 2>/dev/null`를 실행하여 git 저장소인지 확인합니다.

**git 저장소인 경우**: Bash로 `git branch --show-current`를 실행하여 현재 브랜치를 확인한 뒤, `git pull origin {현재 브랜치}`를 실행합니다. 충돌이 발생하면 사용자에게 알리고 중단합니다.

**git 저장소가 아닌 경우**: 이 단계를 스킵합니다.

## 리뷰 범위 결정

**$ARGUMENTS가 비어있거나 제공되지 않은 경우:**
1. Bash로 `git diff` 실행하여 미스테이지 변경사항 확인
2. 미스테이지 변경이 없으면, `git diff --cached`로 스테이지된 변경사항 확인
3. 변경사항이 전혀 없으면, 사용자에게 무엇을 리뷰할지 물어보고 중단

**$ARGUMENTS가 파일이나 디렉토리를 지정한 경우:**
- Glob으로 존재 여부 검증, 해당 파일/디렉토리를 리뷰

**$ARGUMENTS가 "pr" 또는 PR 번호인 경우:**
- Bash로 `git diff main...HEAD`를 실행하여 PR diff 획득

## 사전 조건

`.crew/config.md`가 있으면 읽습니다. `CLAUDE.md`가 있으면 읽습니다.

## Phase 1: 파일 수집

1. 리뷰 범위의 모든 파일 식별
2. 각 파일 읽기 (15개 초과 시 우선순위: 변경된 파일 > 핵심 로직 > 생성/벤더 파일 스킵)
3. git 변경사항 리뷰 시, diff 출력 캡처

## Phase 2: 5개 qa-strategy 에이전트 병렬 실행

**Task tool**을 사용하여 5개 에이전트를 동시에 실행 (subagent_type: **"bams-plugin:qa-strategy"**, model: **"sonnet"**):

### Agent 1 - 정확성 리뷰:

> **관점: 정확성** -- 기능적 정확성 중심으로 리뷰합니다.
> **리뷰할 파일**: [파일 경로 목록 + 내용 또는 diff]
> **프로젝트 가이드라인**: [CLAUDE.md 참조]

### Agent 2 - 보안 리뷰:

> **관점: 보안** -- OWASP Top 10 및 일반적인 취약점을 점검합니다.
> **리뷰할 파일**: [파일 경로 목록 + 내용 또는 diff]

### Agent 3 - 성능 리뷰:

> **관점: 성능** -- 성능 엔지니어링 관점에서 리뷰합니다.
> **리뷰할 파일**: [파일 경로 목록 + 내용 또는 diff]

### Agent 4 - 코드 품질 리뷰:

> **관점: 코드 품질** -- 유지보수성과 코드 표준 관점에서 리뷰합니다.
> **리뷰할 파일**: [파일 경로 목록 + 내용 또는 diff]
> **프로젝트 컨벤션**: [CLAUDE.md와 .crew/config.md 참조]

### Agent 5 - 테스트 커버리지 리뷰:

> **관점: 테스트 커버리지** -- 테스트 충분성과 품질을 리뷰합니다.
> **리뷰할 파일**: [파일 경로 목록 + 내용 또는 diff]

## Phase 3: 리뷰 종합

5개 에이전트가 모두 반환한 후:

1. 모든 발견 사항 수집
2. **중복 제거**: 같은 파일, 같은 라인, 같은 개념의 이슈 병합
3. **정렬**: Critical -> Major -> Minor 순. 같은 심각도 내에서는 신뢰도 높은 순
4. 심각도별 총 이슈 수 집계

## Phase 4: 릴리스 품질 게이트 (release-quality-gate)

서브에이전트 실행 (Task tool, subagent_type: **"bams-plugin:release-quality-gate"**, model: **"opus"**):

> **릴리스 품질 게이트 모드**로 코드 리뷰 결과를 종합 판정합니다.
>
> **리뷰 결과**: [Phase 3의 종합 결과 삽입 -- 심각도별 이슈 수, 상세 이슈 목록]
> **변경된 파일**: [파일 목록]
> **프로젝트 컨텍스트**: [config.md 내용]
>
> 판정 기준:
> - **PASS**: Critical 0건, Major 2건 이하
> - **CONDITIONAL**: Critical 0건이지만 Major 3건 이상, 또는 테스트 커버리지 미흡
> - **FAIL**: Critical 1건 이상
>
> 반환: 판정 결과, 근거, 필수 수정 사항, 권장 수정 사항

## Phase 5: 리포트 저장

타임스탬프 slug 생성 (예: `2026-03-31-143052`).

리뷰 리포트를 `.crew/artifacts/review/review-[timestamp].md`에 저장합니다:
- **요약**: 심각도별 이슈 건수, 릴리스 게이트 판정
- **Critical/Major/Minor 이슈**: 각 이슈 상세 (카테고리, file:line, 설명, 수정안)
- **릴리스 게이트 판정**: PASS/CONDITIONAL/FAIL + 근거
- **긍정적 관찰**: 잘된 점

## Phase 6: 결과 제시

사용자에게 결과를 표시합니다:

```
코드 리뷰 완료
══════════════════════════════════════
리뷰 범위: [파일/디렉토리/PR]
리포트: .crew/artifacts/review/review-[timestamp].md

이슈 요약:
  Critical: [N]건
  Major:    [N]건
  Minor:    [N]건

릴리스 게이트: [PASS/CONDITIONAL/FAIL]
```

그 다음 모든 Critical 및 Major 이슈를 상세와 함께 나열합니다.

## Phase 7: 이슈 수정 제안

Critical 또는 Major 이슈가 있으면, **AskUserQuestion** (multiSelect: true)으로 수정할 이슈를 선택받습니다.

선택된 이슈들에 대해:
1. 각 이슈의 수정사항을 Edit 도구로 적용
2. 수정된 이슈를 리포트에서 `[수정됨]` 태그 추가
3. 수정 완료 후 요약 표시

git 저장소인 경우, 수정 후 `git diff --stat` 표시하고 적용/되돌리기 확인.

## Phase 8: CLAUDE.md 상태 업데이트

`CLAUDE.md`의 `## Bams 현재 상태` 섹션을 업데이트합니다.
