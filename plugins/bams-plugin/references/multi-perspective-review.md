# 5관점 코드 리뷰 → aspect 리뷰 — SSOT

`commands/bams/review.md`, `commands/bams/deep-review.md`가 공통으로 참조한다 (Pattern A — 전체 참조).

두 커맨드 모두 아래 aspect 정의·code aspect 5관점 정의·위임 메시지 템플릿·컨텍스트 패키징 포맷·종합/중복 제거 규칙·리포트 템플릿을 그대로 따른다. 커맨드별로 달라지는 부분(병렬 범위, 게이트 포함 여부)은 아래 "역할 구분" 표와 각 stub의 "차이점" 절에만 남긴다.

## 역할 구분 (필독)

| 커맨드 | 성격 | 게이트 포함 | 병렬 범위 |
|--------|------|-------------|-----------|
| `/bams:review` | 빠른 스크린 | **O** — release-quality-gate가 Phase 4에서 PASS/CONDITIONAL/FAIL 판정 (임계값: `commands/bams/review.md` Phase 4 참조) | 5관점만 (qa-strategy 병렬) |
| `/bams:deep-review` | 심층 다관점 | **X — 출시 게이트 미포함. 릴리스 승인이 필요하면 `/bams:review` Phase 4 또는 `/bams:ship`을 별도 실행할 것.** deep-review는 구조적 리뷰 + Codex 세컨드 오피니언까지 포함한 진단 전용 파이프라인이다. | 5관점 + 구조적 리뷰 + Codex, 선택에 따라 최대 7개 동시 실행 |

두 커맨드는 서로 대체 관계가 아니다: `/bams:review`는 출시 직전 빠른 판정, `/bams:deep-review`는 정기 점검·구조 개선 진단에 사용한다.

## aspect 정의

5개 aspect는 **직교(orthogonal)**이며 병렬인 최상위 리뷰 차원이다. `code` aspect의 5관점(정확성/보안/성능/품질/테스트, 아래 §code aspect 참조)을 대체하지 않는다.

| Aspect | 정의 | 부서장 | Specialist(최대 1회) | step_number(§병렬 spawn 상한 및 step_number 매핑) |
|---|---|---|---|---|
| `spec` | PRD·spec·AC 대비 구현 일치 | product-strategy | business-analysis | 20 |
| `functional` | 기능 동작·엣지케이스·회귀 | qa-strategy | defect-triage, automation-qa | 21 |
| `performance` | 벤치마크·N+1·번들·렌더링 | product-analytics | performance-evaluation | 22 |
| `code` | 정확성/보안/성능/품질/테스트 (기존 5관점, 아래 §code aspect — 5관점 정의 참조) | qa-strategy | automation-qa | 23 |
| `uiux` | 시각 충실도·접근성·사용성 | design-director (`gpt-5-codex`) | visual-fidelity-verifier, accessibility-auditor | 24 |

(위 step_number는 review.md 기준. deep-review.md는 §step_number 예약 구간 상세표 참조.)

`all` = 5개 전체. 인자 미지정 시 기본값은 `code` 단독이며, 이 경우 review.md/deep-review.md는 **아래 §--aspect 인자 파싱 규칙 이후를 전혀 거치지 않고 기존 흐름을 그대로 실행**한다(하위 호환, §종합/중복 제거 규칙 참조).

## code aspect — 5관점 정의 (상세 체크리스트)

리뷰를 수행하는 모든 qa-strategy(또는 그 specialist) 에이전트는 아래 5관점을 기준으로 이슈를 식별한다.

1. **정확성 (Correctness)** — 로직 오류, 엣지 케이스, 타입 안전성
2. **보안 (Security)** — 인젝션, 인증/인가, 시크릿 노출
3. **성능 (Performance)** — 불필요한 연산, N+1, 메모리 누수
4. **코드 품질 (Quality)** — 가독성, 중복, 패턴 일관성
5. **테스트 (Testing)** — 커버리지 갭, 테스트 신뢰성

각 관점의 심각도(Critical/Major/Minor) 판정 기준과 신뢰도 임계값은 `references/issue-severity.md`를 참조한다. 릴리스 게이트 통과 수치(PASS/CONDITIONAL/FAIL 임계값)는 이 파일의 스코프가 아니며, 현재는 `commands/bams/review.md` Phase 4에 하드코딩되어 있다 (SSOT 승격은 별도 트랙 소관).

## qa-strategy 위임 메시지 템플릿 (code aspect)

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
  5관점 정의는 본 문서 §code aspect — 5관점 정의 참조 (정확성/보안/성능/코드 품질/테스트).
```

QA부장(qa-strategy)은 도메인 내 관점별 specialist(automation-qa, defect-triage 등)를 **최대 1회** 추가 spawn 가능(harness 깊이 2 한도).

`code` aspect는 아래 §aspect별 위임 메시지 템플릿의 canonical 템플릿을 적용하지 않고, 위 템플릿을 그대로 사용한다(하위 호환).

## --aspect 인자 파싱 규칙

review.md·deep-review.md 모두 아래 알고리즘을 Pre-flight 직후, 파일 수집/spawn 이전에 실행한다(spawn 이전 차단).

1. `$ARGUMENTS`에 `--aspect`가 없으면 `ASPECT_LIST = ["code"]`로 고정하고 **이하 전 단계를 스킵**, 기존 흐름 그대로 진행 (커맨드 stub 쪽 "기본 동작" 분기).
2. `--aspect ` 뒤 값(다음 공백 또는 문자열 끝까지)을 추출해 콤마로 분리 → `raw_list`.
3. `raw_list == ["list"]`이면 위 §aspect 정의 표를 출력하고 **즉시 종료**(스캔·spawn 없음, 4~7번 스킵). 허용 집합 검사(5번) 대상이 아니다.
4. `raw_list`에 `all`이 포함되어 있으면: `raw_list` 길이가 2 이상이면(다른 값과 혼용) 5번 진입 전에 즉시 `error` 이벤트 emit: `message="'all'은 다른 aspect와 혼용할 수 없습니다. --aspect all 단독으로 사용하세요"` 후 **즉시 HALT**(파일 수집·spawn 없음). `all` 단독이면 `ASPECT_LIST = [spec, functional, performance, code, uiux]`로 확정.
5. 각 토큰을 허용 집합 `{spec, functional, performance, code, uiux, all}`과 대조. 미포함 토큰 발견 시:
   - `error` 이벤트 emit: `message="잘못된 aspect 이름: {token}. 허용값: spec,functional,performance,code,uiux,all"`
   - 사용자에게 동일 메시지 출력 후 **즉시 HALT** (파일 수집·spawn 없음, `pipeline_end status=failed` 또는 파이프라인 미시작 상태로 종료)
6. `ASPECT_LIST` 중복 제거(예: `code,code` → `[code]`).
7. `--aspect` 토큰과 그 값을 `$ARGUMENTS`에서 제거한 나머지 문자열을 `REVIEW_TARGET`(파일/디렉토리/`pr`)으로 사용 — 기존 "리뷰 범위 결정" 로직 입력으로 그대로 전달.

이 알고리즘은 review.md·deep-review.md 두 stub이 **동일하게** Pattern A로 참조한다(파싱 로직 자체는 두 커맨드 간 차이가 없음).

## aspect별 위임 메시지 템플릿

`code` 이외 4개 aspect(spec/functional/performance/uiux)는 아래 canonical 템플릿 + delta 표로 위임 메시지를 구성한다(5개 템플릿 전문 나열 대신 압축).

### Canonical 템플릿

```
task_description: "{ASPECT_VERB} 리뷰를 실행하라 (aspect: {ASPECT_NAME})"
input_artifacts:
  - context_package: [§컨텍스트 패키징 포맷 참조 — Phase 1 수집 결과, 부서장은 재Read 금지]
  - {ASPECT_EXTRA_ARTIFACTS}
  - CLAUDE.md
  - .crew/config.md
expected_output:
  type: {ASPECT_OUTPUT_TYPE}
quality_criteria:
  aspect 정의는 본 문서 §aspect 정의 - {ASPECT_NAME} 참조.
  {ASPECT_EXTRA_CRITERIA}
```

{부서장}은 도메인 내 Specialist(§aspect 정의 표 참조)를 **최대 1회** 추가 spawn 가능(harness 깊이 2 한도).

### Delta 표

| aspect | `{ASPECT_VERB}` | `{ASPECT_EXTRA_ARTIFACTS}` | `{ASPECT_OUTPUT_TYPE}` | `{ASPECT_EXTRA_CRITERIA}` |
|---|---|---|---|---|
| spec | PRD/spec/AC 대비 구현 정합성 | `.crew/artifacts/prd/*.md`, `.crew/artifacts/design/*-spec.md` (있는 것만) | spec_compliance_review | PRD/spec 부재 시 "spec aspect 스킵" 경고 후 다른 aspect는 계속 진행 |
| functional | 기능 동작·엣지케이스·회귀 | (context_package로 충분) | functional_review | defect-triage/automation-qa 라우팅 우선 |
| performance | 벤치마크·N+1·번들·렌더링 | 최근 benchmark 리포트 경로(있으면) | performance_review | LCP/번들 임계값은 `issue-severity.md` §aspect별 Override 참조 |
| uiux | 시각 충실도·접근성·사용성 | 스크린샷 경로 또는 대상 URL(없으면 정적 diff만 수행) | uiux_review | WCAG AA 위반은 Critical(issue-severity.md §aspect별 Override), 모델은 `gpt-5-codex` 고정 |

`code` aspect는 위 canonical 템플릿을 적용하지 않고 §qa-strategy 위임 메시지 템플릿(code aspect)을 그대로 사용한다(하위 호환).

## 컨텍스트 패키징 포맷

Phase 1(파일 수집)에서 얻은 파일 경로·내용(또는 diff)을 부서장 위임 메시지의 `context_package` 필드에 Markdown 블록으로 첨부한다. 이 필드가 있으면 부서장은 `input_artifacts`에 나열된 동일 파일을 재Read하지 않는다(specialist는 필요 시 재Read 가능). 각 department별 delegation 메시지에 동일한 Context Package 블록을 그대로 복사해 첨부한다(aspect마다 새로 만들지 않음 — Phase 1은 1회만 수행).

### 표준 포맷

```markdown
### Context Package (Phase 1 공유 — 재Read 금지)

수집 파일: {N}개 / 총 {approx_kb}KB / 생성: {slug}-Phase1

#### 1. `{file_path_1}` ({diff | full} · {line_count}줄)
{파일 전체 내용 또는 git diff 청크를 코드블록으로 삽입}

#### 2. `{file_path_2}` ({diff | full} · {line_count}줄)
...

(이하 반복, 최대 15개 — 아래 §15개 초과 시 우선순위 선별)
```

### 15개 초과 시 우선순위 선별

기존 Phase 1(파일 수집) 규칙을 그대로 재사용한다: "15개 초과 시 우선순위: 변경된 파일 > 핵심 로직 > 생성/벤더 파일 스킵". 선별에서 제외된 파일은 경로만 별도 "참고용 파일 목록(미포함)" 섹션에 나열해 각 부서장이 필요 시 직접 재Read할 수 있는 단서를 남긴다.

### 크기 초과 시 fallback

Context Package 블록의 문자 수가 80,000자를 초과하면 fallback 모드로 전환한다: 블록을 프롬프트에 임베드하는 대신 `.crew/tmp/review-context-{slug}.md`에 동일한 Markdown 블록을 저장하고, delegation 메시지의 `context_package` 필드에는 파일 경로 1줄만 전달한다. 부서장은 이 경로를 1회만 Read한다. `.crew/tmp/`는 파이프라인 종료 시 정리 대상으로 등록한다. 동일 slug로 재실행 시 기존 파일은 덮어쓴다.

### 다중 aspect 시 fallback

선택된 aspect가 2개 이상이면, Context Package 블록 크기(80,000자)와 무관하게 `.crew/tmp/review-context-{slug}.md`에 1회 저장하고 각 부서장 delegation 메시지의 `context_package` 필드에는 파일 경로 1줄만 전달한다(각 부서장은 이 경로를 최대 1회 Read). 즉 "80,000자 초과" 또는 "aspect 2개 이상" 두 조건 중 하나라도 만족하면 fallback 모드로 전환한다.

## 병렬 spawn 상한 및 step_number 매핑

- **review.md**: aspect 최대 5개 병렬(§aspect 정의 표) — 5 ≤ 8이므로 배치 분할 불필요.
- **deep-review.md**: 5 aspect + 구조적 리뷰 + Codex = 최대 7개 동시 실행(기존 정책) → 8 미만이므로 배치 분할 불필요. 향후 aspect 추가 시 8 초과하면 배치 분할(구조적 리뷰·Codex 우선, aspect는 2개 배치로 분리) 로직을 이 절에 추가한다.

### step_number 예약 구간 (event-schema.json 준수 — 파이프라인 내 유일해야 함)

| aspect | review.md에서(다중 aspect 시만 emit) | deep-review.md에서(code 제외 4개, 기존 Step1~4와 겹치지 않게 이어붙임) |
|---|---|---|
| spec | 20 | 5 (기존 Step 4를 Advisor call_id `pipeline-orchestrator-4-{date}`가 점유 — +1 이동, TASK-112 실측 정정) |
| functional | 21 | 6 |
| performance | 22 | 7 |
| code | 23(다중 aspect 조합 시만. 단독 code면 기존 흐름 그대로라 step 이벤트 없음) | (기존 Step1이 이미 code 담당 — 신규 번호 없음) |
| uiux | 24 | 8 |

step_name 형식: `aspect-{name} 리뷰`. deep-review.md의 `pipeline_end`의 `{total}`은 기존 하드코딩 `3` 대신 `3 + (code를 제외한 선택 aspect 수)`로 동적 계산한다.

## 종합/중복 제거 규칙

5개 관점(및 deep-review의 경우 구조적 리뷰·Codex)의 결과를 하나의 리포트로 합칠 때 다음 순서를 따른다.

1. 모든 발견 사항 수집
2. **중복 제거**: 같은 파일, 같은 라인, 같은 개념의 이슈 병합
3. **재검증** (이전 리뷰 산출물이 있는 경우): `resolved` / `persists` 판정
4. **정렬**: Critical → Major → Minor 순. 같은 심각도 내에서는 신뢰도 높은 순
5. 심각도별 총 이슈 수 집계
6. (다중 aspect 실행 시) 각 발견 사항에 `[aspect: {name}]` 태그를 부여하여 Executive Summary에서 aspect별 이슈 카테고리를 구분 표시한다.

## 리포트 템플릿 (Critical/Major/Minor 구조)

- **요약**: 심각도별 이슈 건수 (+ `/bams:review`인 경우 릴리스 게이트 판정)
- **Critical/Major/Minor 이슈**: 각 이슈 상세 — 카테고리(5관점 중 하나), file:line, 설명, 수정안, 신뢰도
- **긍정적 관찰**: 잘된 점
- (`/bams:review`만) **릴리스 게이트 판정**: PASS/CONDITIONAL/FAIL + 근거
