# 5관점 코드 리뷰 → aspect 리뷰 — SSOT

`commands/bams/review.md`, `commands/bams/deep-review.md`가 공통으로 참조한다 (Pattern A). 커맨드별 차이(병렬 범위, 게이트 포함 여부)는 아래 "역할 구분" 표와 각 커맨드의 "차이점"에만 둔다.

## 역할 구분 (필독)

| 커맨드 | 성격 | 게이트 포함 | 병렬 범위 |
|--------|------|-------------|-----------|
| `/bams:review` | 빠른 스크린 | **O** — Phase 4에서 PASS/CONDITIONAL/FAIL 판정 (임계값: `references/issue-severity.md` §Release Gate 임계값) | 5관점 (qa-strategy) + 선택 aspect |
| `/bams:deep-review` | 심층 진단 | **X** — 릴리스 승인이 필요하면 `/bams:review` 또는 `/bams:ship`을 별도 실행 | 5관점 + 구조적 리뷰 + Codex, 최대 7개 동시 |

`/bams:review`는 출시 직전 판정, `/bams:deep-review`는 정기 점검·구조 개선 진단용이다(대체 관계 아님).

## aspect 정의

5개 aspect는 서로 직교하는 최상위 리뷰 차원이다. `code` aspect의 5관점을 대체하지 않는다.

| Aspect | 정의 | 부서장 | Specialist(최대 1회) |
|---|---|---|---|
| `spec` | PRD·spec·AC 대비 구현 일치 | product-strategy | business-analysis |
| `functional` | 기능 동작·엣지케이스·회귀 | qa-strategy | defect-triage, automation-qa |
| `performance` | 벤치마크·N+1·번들·렌더링 | product-analytics | performance-evaluation |
| `code` | 정확성/보안/성능/품질/테스트 (아래 §code aspect — 5관점 정의) | qa-strategy | automation-qa |
| `uiux` | 시각 충실도·접근성·사용성 | design-director (본문 codex 위임 `gpt-6.1-sol`) | visual-fidelity-verifier, accessibility-auditor |

`all` = 5개 전체. 인자 미지정 시 `code` 단독이며 이 경우 §--aspect 인자 파싱 규칙 이후를 거치지 않고 기존 흐름을 그대로 실행한다(하위 호환).

## code aspect — 5관점 정의 (상세 체크리스트)

1. **정확성 (Correctness)** — 로직 오류, 엣지 케이스, 타입 안전성
2. **보안 (Security)** — 인젝션, 인증/인가, 시크릿 노출
3. **성능 (Performance)** — 불필요한 연산, N+1, 메모리 누수
4. **코드 품질 (Quality)** — 가독성, 중복, 패턴 일관성
5. **테스트 (Testing)** — 커버리지 갭, 테스트 신뢰성

심각도 기준과 confidence 앵커는 `references/issue-severity.md`, 지적 형식과 필터는 아래 §지적 검증 필터를 따른다.

## qa-strategy 위임 메시지 템플릿 (code aspect)

`code` aspect는 아래 템플릿을 그대로 쓴다(§aspect별 위임 메시지 템플릿의 canonical 템플릿 미적용 — 하위 호환). quality_criteria의 5관점 항목명은 변경하지 않는다.

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
  지적 형식·confidence·false positive 제외는 본 문서 §지적 검증 필터 1~2.
```

QA부장은 도메인 내 specialist(automation-qa, defect-triage 등)를 **최대 1회** 추가 spawn 가능(harness 깊이 2 한도).

## --aspect 인자 파싱 규칙

review.md·deep-review.md 모두 Pre-flight 직후, 파일 수집/spawn 이전에 실행한다.

1. `$ARGUMENTS`에 `--aspect`가 없으면 `ASPECT_LIST = ["code"]`로 고정하고 **이하 전 단계를 스킵**, 기존 흐름 그대로 진행.
2. `--aspect ` 뒤 값(다음 공백 또는 문자열 끝까지)을 추출해 콤마로 분리 → `raw_list`.
3. `raw_list == ["list"]`이면 위 §aspect 정의 표를 출력하고 **즉시 종료**(스캔·spawn 없음, 4~7번 스킵). 허용 집합 검사(5번) 대상이 아니다.
4. `raw_list`에 `all`이 포함되어 있으면: `raw_list` 길이가 2 이상이면(다른 값과 혼용) 5번 진입 전에 즉시 에러 메시지 출력: `"'all'은 다른 aspect와 혼용할 수 없습니다. --aspect all 단독으로 사용하세요"` 후 **즉시 HALT**(파일 수집·spawn 없음). `all` 단독이면 `ASPECT_LIST = [spec, functional, performance, code, uiux]`로 확정.
5. 각 토큰을 허용 집합 `{spec, functional, performance, code, uiux, all}`과 대조. 미포함 토큰 발견 시:
   - 에러 메시지 출력: `"잘못된 aspect 이름: {token}. 허용값: spec,functional,performance,code,uiux,all"`
   - 사용자에게 동일 메시지 출력 후 **즉시 HALT** (파일 수집·spawn 없음, 파이프라인 미시작 상태로 종료)
6. `ASPECT_LIST` 중복 제거(예: `code,code` → `[code]`).
7. `--aspect` 토큰과 그 값을 `$ARGUMENTS`에서 제거한 나머지 문자열을 `REVIEW_TARGET`(파일/디렉토리/`pr`)으로 사용 — 기존 "리뷰 범위 결정" 로직 입력으로 그대로 전달.

## aspect별 위임 메시지 템플릿

`code` 이외 4개 aspect는 아래 canonical 템플릿 + delta 표로 위임 메시지를 구성한다.

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
  지적 형식·confidence·false positive 제외는 본 문서 §지적 검증 필터 1~2.
  {ASPECT_EXTRA_CRITERIA}
```

{부서장}은 도메인 내 Specialist(§aspect 정의 표 참조)를 **최대 1회** 추가 spawn 가능(harness 깊이 2 한도).

### Delta 표

| aspect | `{ASPECT_VERB}` | `{ASPECT_EXTRA_ARTIFACTS}` | `{ASPECT_OUTPUT_TYPE}` | `{ASPECT_EXTRA_CRITERIA}` |
|---|---|---|---|---|
| spec | PRD/spec/AC 대비 구현 정합성 | `.crew/artifacts/prd/*.md`, `.crew/artifacts/design/*-spec.md` (있는 것만) | spec_compliance_review | PRD/spec 부재 시 "spec aspect 스킵" 경고 후 다른 aspect는 계속 진행 |
| functional | 기능 동작·엣지케이스·회귀 | (context_package로 충분) | functional_review | defect-triage/automation-qa 라우팅 우선 |
| performance | 벤치마크·N+1·번들·렌더링 | 최근 benchmark 리포트 경로(있으면) | performance_review | LCP/번들 임계값은 `issue-severity.md` §aspect별 Override 참조 |
| uiux | 시각 충실도·접근성·사용성 | 스크린샷 경로 또는 대상 URL(없으면 정적 diff만 수행) | uiux_review | WCAG AA 위반은 Critical(issue-severity.md §aspect별 Override), codex 위임 모델은 `gpt-6.1-sol`(codex-delegation.md SSOT) |

## 지적 검증 필터

리뷰어는 많이 찾는 것보다 맞게 찾는 것이 목표다. 오탐은 리뷰 전체의 신뢰를 깎는다.

1. **지적 형식 (리뷰어)** — 지적마다 `심각도 | file:line | 문제 | 근거(코드 인용 또는 실행 출력) | 수정안 | confidence`. confidence는 `issue-severity.md` §신뢰도 기준 앵커로 매기고 **80 미만은 보고하지 않는다.**
2. **false positive — 보고하지 않는다**
   - 이번 변경 전부터 있던 문제 / 변경 범위 밖의 코드
   - 린터·타입체커·포매터가 잡는 것 (확인하려고 린터를 돌리지 않는다)
   - 취향·스타일 지적 (CLAUDE.md·config.md에 명시된 규칙 위반이 아니면)
   - 버그처럼 보이지만 실제로는 맞는 코드, 코드에서 명시적으로 억제된 경고(lint ignore 등)
   - 특정 입력·상태에서만 성립하는 추측성 지적 (재현 경로를 쓸 수 없으면)
3. **메인 필터** — 종합 시 confidence 80 미만과 위 목록 해당 지적을 제거한다. 구조적 리뷰·Codex처럼 confidence가 없는 출처는 이 단계를 건너뛰고 4로 간다.
4. **독립 검증 (메인이 spawn)** — 남은 Critical/Major 지적마다 쓰기 권한 없는 검증자 1개를 spawn한다. 서브에이전트는 다른 에이전트를 spawn할 수 없으므로 이 단계는 메인 커맨드가 수행한다. 지적들을 한 메시지에 묶어 병렬 spawn하고, 8개를 넘으면 8개씩 나눈다. 검증자 프롬프트:
   ```
   리뷰 지적 1건이 실제 문제인지 확인하라. 지적을 쓴 리뷰어와 독립적으로 판단한다.
   지적: {심각도} | {file:line} | {문제} | {근거}
   변경 의도: {PR 제목·설명 또는 태스크 요약}  diff: {해당 파일 diff 또는 경로}
   해당 코드를 직접 Read하고, 필요하면 읽기 전용 명령으로 재현한다. 파일을 수정하지 않는다.
   §지적 검증 필터 2의 false positive에 해당하면 REFUTED.
   반환(3줄): verdict: CONFIRMED | REFUTED | UNCERTAIN / severity: {유지 또는 낮춘 등급} / evidence: {코드 인용 또는 명령+출력}
   ```
5. **반영** — CONFIRMED만 Critical/Major로 남긴다(검증자가 낮춘 등급이 있으면 그 등급). REFUTED·UNCERTAIN은 게이트 집계에서 빼고 리포트의 "제외된 지적"에 1줄씩 남긴다. Minor는 검증하지 않는다.

## 컨텍스트 패키징 포맷

Phase 1(파일 수집)에서 얻은 파일 경로·내용(또는 diff)을 부서장 위임 메시지의 `context_package` 필드에 Markdown 블록으로 첨부한다. 이 필드가 있으면 부서장은 `input_artifacts`의 동일 파일을 재Read하지 않는다(specialist는 필요 시 재Read 가능). Phase 1은 1회만 수행하고 모든 위임 메시지에 같은 블록을 붙인다.

### 표준 포맷

```markdown
### Context Package (Phase 1 공유 — 재Read 금지)

수집 파일: {N}개 / 총 {approx_kb}KB / 생성: {slug}-Phase1

#### 1. `{file_path_1}` ({diff | full} · {line_count}줄)
{파일 전체 내용 또는 git diff 청크를 코드블록으로 삽입}

#### 2. `{file_path_2}` ({diff | full} · {line_count}줄)
...

(이하 반복, 최대 15개)
```

15개 초과 시 "변경된 파일 > 핵심 로직 > 생성/벤더 파일 스킵" 순으로 선별하고, 제외 파일은 경로만 "참고용 파일 목록(미포함)"에 나열한다.

### 파일 fallback

블록이 80,000자를 넘거나 aspect가 2개 이상이면 블록을 `.crew/tmp/review-context-{slug}.md`에 1회 저장하고 `context_package`에는 경로 1줄만 넣는다(부서장은 최대 1회 Read). 동일 slug 재실행 시 덮어쓰며, `.crew/tmp/`는 파이프라인 종료 시 정리한다.

## 병렬 spawn 상한

- **review.md**: aspect 최대 5개 병렬 — 상한 8 이내.
- **deep-review.md**: 5 aspect + 구조적 리뷰 + Codex = 최대 7개. aspect 추가로 8을 넘으면 구조적 리뷰·Codex를 먼저, aspect를 2개 배치로 나눈다.
- §지적 검증 필터 4의 검증자 spawn은 별도 메시지이며 8개씩 나눈다.

## 종합/중복 제거 규칙

5관점(및 deep-review의 구조적 리뷰·Codex) 결과를 하나의 리포트로 합칠 때:

1. 모든 발견 사항 수집
2. **중복 제거**: 같은 파일, 같은 라인, 같은 개념의 이슈 병합
3. **재검증** (이전 리뷰 산출물이 있는 경우): `resolved` / `persists` 판정
4. **필터·독립 검증**: §지적 검증 필터 3~5
5. **정렬**: Critical → Major → Minor 순. 같은 심각도 내에서는 confidence 높은 순
6. 심각도별 총 이슈 수 집계
7. (다중 aspect 실행 시) 각 발견 사항에 `[aspect: {name}]` 태그를 부여하여 Executive Summary에서 aspect별로 구분 표시한다.

## 리포트 템플릿 (Critical/Major/Minor 구조)

- **요약**: 심각도별 이슈 건수, 제외된 지적 수(confidence 미달/false positive/검증 탈락) (+ `/bams:review`인 경우 릴리스 게이트 판정)
- **Critical/Major/Minor 이슈**: 각 이슈 상세 — 카테고리(5관점 중 하나), file:line, 설명, 근거, 수정안, confidence, 검증 결과(Critical/Major)
- **제외된 지적**: 1줄씩 — 지적 요약 + 제외 사유
- **긍정적 관찰**: 잘된 점
- (`/bams:review`만) **릴리스 게이트 판정**: PASS/CONDITIONAL/FAIL + 근거
