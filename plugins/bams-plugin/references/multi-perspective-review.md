# 5관점 코드 리뷰 — SSOT

`commands/bams/review.md`, `commands/bams/deep-review.md`가 공통으로 참조한다 (Pattern A — 전체 참조).

두 커맨드 모두 아래 5관점 정의와 qa-strategy 위임 메시지 템플릿, 종합/중복 제거 규칙, 리포트 템플릿을 그대로 따른다. 커맨드별로 달라지는 부분(병렬 범위, 게이트 포함 여부)은 아래 "역할 구분" 표와 각 stub의 "차이점" 절에만 남긴다.

## 역할 구분 (필독)

| 커맨드 | 성격 | 게이트 포함 | 병렬 범위 |
|--------|------|-------------|-----------|
| `/bams:review` | 빠른 스크린 | **O** — release-quality-gate가 Phase 4에서 PASS/CONDITIONAL/FAIL 판정 (임계값: `commands/bams/review.md` Phase 4 참조) | 5관점만 (qa-strategy 병렬) |
| `/bams:deep-review` | 심층 다관점 | **X — 출시 게이트 미포함. 릴리스 승인이 필요하면 `/bams:review` Phase 4 또는 `/bams:ship`을 별도 실행할 것.** deep-review는 구조적 리뷰 + Codex 세컨드 오피니언까지 포함한 진단 전용 파이프라인이다. | 5관점 + 구조적 리뷰 + Codex, 선택에 따라 최대 7개 동시 실행 |

두 커맨드는 서로 대체 관계가 아니다: `/bams:review`는 출시 직전 빠른 판정, `/bams:deep-review`는 정기 점검·구조 개선 진단에 사용한다.

## 5관점 정의 (상세 체크리스트)

리뷰를 수행하는 모든 qa-strategy(또는 그 specialist) 에이전트는 아래 5관점을 기준으로 이슈를 식별한다.

1. **정확성 (Correctness)** — 로직 오류, 엣지 케이스, 타입 안전성
2. **보안 (Security)** — 인젝션, 인증/인가, 시크릿 노출
3. **성능 (Performance)** — 불필요한 연산, N+1, 메모리 누수
4. **코드 품질 (Quality)** — 가독성, 중복, 패턴 일관성
5. **테스트 (Testing)** — 커버리지 갭, 테스트 신뢰성

각 관점의 심각도(Critical/Major/Minor) 판정 기준과 신뢰도 임계값은 `references/issue-severity.md`를 참조한다. 릴리스 게이트 통과 수치(PASS/CONDITIONAL/FAIL 임계값)는 이 파일의 스코프가 아니며, 현재는 `commands/bams/review.md` Phase 4에 하드코딩되어 있다 (SSOT 승격은 별도 트랙 소관).

## qa-strategy 위임 메시지 템플릿

커맨드가 5관점 병렬 리뷰를 위해 qa-strategy를 spawn할 때 사용하는 표준 위임 메시지다. `/bams:review`, `/bams:deep-review` 모두 이 템플릿을 기준으로 삼는다(문구는 각 stub에서 파이프라인 맥락에 맞게 조정 가능하되 quality_criteria의 5관점 항목명은 변경하지 않는다).

```
task_description: "5관점 병렬 코드 리뷰를 실행하라"
input_artifacts:
  - [파일 경로 목록 + 내용 또는 diff]
  - CLAUDE.md
  - .crew/config.md
expected_output:
  type: multi_perspective_review
quality_criteria:
  5관점 정의는 본 문서 §5관점 정의 참조 (정확성/보안/성능/코드 품질/테스트).
```

QA부장(qa-strategy)은 도메인 내 관점별 specialist(automation-qa, defect-triage 등)를 **최대 1회** 추가 spawn 가능(harness 깊이 2 한도).

## 종합/중복 제거 규칙

5개 관점(및 deep-review의 경우 구조적 리뷰·Codex)의 결과를 하나의 리포트로 합칠 때 다음 순서를 따른다.

1. 모든 발견 사항 수집
2. **중복 제거**: 같은 파일, 같은 라인, 같은 개념의 이슈 병합
3. **재검증** (이전 리뷰 산출물이 있는 경우): `resolved` / `persists` 판정
4. **정렬**: Critical → Major → Minor 순. 같은 심각도 내에서는 신뢰도 높은 순
5. 심각도별 총 이슈 수 집계

## 리포트 템플릿 (Critical/Major/Minor 구조)

- **요약**: 심각도별 이슈 건수 (+ `/bams:review`인 경우 릴리스 게이트 판정)
- **Critical/Major/Minor 이슈**: 각 이슈 상세 — 카테고리(5관점 중 하나), file:line, 설명, 수정안, 신뢰도
- **긍정적 관찰**: 잘된 점
- (`/bams:review`만) **릴리스 게이트 판정**: PASS/CONDITIONAL/FAIL + 근거
