# 에이전트 개선 프로토콜 (Agent Improvement Protocol)

에이전트의 반복적 패턴 실수를 감지하고, 구조적 개선을 적용하는 프로토콜입니다.
deep-review 및 hotfix finalization에서 개선점이 발견될 때 이 프로토콜의 Evolution Hook을 실행합니다.

## 1. 개선 기록 구조

개선점은 에이전트별 **`.crew/memory/{agent-slug}/MEMORY.md` 항목**으로 append합니다(단일 파일 규칙 — `references/agent-memory.md`). 별도 `improvements/*.md` 파일을 신규 생성하지 않습니다.

### 항목 형식

```markdown
## [YYYY-MM-DD] {pipeline-slug}
- ({pattern_tag} · {type} · {severity}) {반복 발견된 패턴 요약과 개선 제안}
- [교훈 불릿 — 항목당 최대 3개]
```

- `pattern_tag`/`type`/`severity`는 불릿 앞 괄호에 인라인 주석으로 남겨 §2~§4 반복 감지에 활용합니다.
- 원본/리뷰 파이프라인 구분이 필요하면 불릿에 `(원본: {parent_pipeline_slug})`를 덧붙입니다.

## 2. pattern_tag 체계

카테고리와 구체적 태그를 콜론으로 구분합니다:

| 카테고리 | 설명 | 태그 예시 |
|---------|------|----------|
| `code-quality:` | 코드 품질 관련 | `null-safety`, `error-handling`, `naming` |
| `architecture:` | 아키텍처/설계 관련 | `coupling`, `layer-violation`, `state-management` |
| `performance:` | 성능 관련 | `n-plus-one`, `memory-leak`, `bundle-size` |
| `security:` | 보안 관련 | `injection`, `auth-bypass`, `secret-exposure` |
| `test-coverage:` | 테스트 관련 | `missing-edge-case`, `flaky-test`, `mock-abuse` |

## 3. severity 분류

| 등급 | 기준 | 조치 |
|------|------|------|
| `minor` | 코드 스타일, 사소한 비효율 | 기록만 (자동 개선 대상 아님) |
| `major` | 버그 가능성, 유지보수 저해 | 반복 시 개선 제안 |
| `critical` | 보안 취약점, 데이터 손실 위험 | 즉시 개선 제안 |

## 4. 반복 감지 조건

동일 `pattern_tag`가 다음 조건을 충족하면 "반복"으로 판정합니다:

| 조건 | 설명 |
|------|------|
| 동일 에이전트에서 2회 이상 | 같은 에이전트가 같은 패턴 태그로 기록됨 |
| type이 `structural` | one-off가 아닌 구조적 문제 |
| 최근 30일 이내 | 오래된 기록은 반복 판정에서 제외 |

## 5. Evolution Hook

반복 감지 시 실행하는 개선 프로세스입니다.

### 트리거 조건
- `type: structural` 이고 동일 `pattern_tag`가 2회 이상 반복
- 사용자가 AskUserQuestion에서 "Yes" 응답

### 실행 단계

1. **패턴 분석**: 해당 pattern_tag의 모든 MEMORY.md 항목을 수집하여 공통 원인 도출
2. **개선안 작성**: 에이전트의 행동 규칙 또는 프롬프트 수정안 제안
3. **사용자 승인**: AskUserQuestion으로 수정안 승인 요청
4. **적용**: 승인 시 에이전트 `.md` 파일의 행동 규칙 섹션 수정
5. **검증 마커**: 해당 MEMORY.md 항목 불릿에 `(resolved: {수정 내용 요약})` 추가

### 적용 대상

| 대상 | 수정 위치 | 예시 |
|------|----------|------|
| 에이전트 행동 규칙 | `agents/{agent}.md` 의 행동 규칙 섹션 | "SQL 작성 시 반드시 파라미터 바인딩" 추가 |
| 스킬 프로세스 | `commands/bams/{skill}.md` 의 해당 Step | Step 체크리스트에 검증 항목 추가 |
| gotchas 승격 | `.crew/gotchas.md` | gotchas-spec.md 승격 규칙에 따라 처리 |

**정의 파일 기록 제약 (retro-protocol.md §5-4 정합)**: `agents/*.md`·`references/*.md`에 반영하는 개선은 **항구적 일반 규칙**에 한하며, 회고 슬러그·날짜·프로젝트 특정 경로·점수·KPT 인용을 정의 파일에 넣지 않는다(일반 규칙 문장만). 회고 유래 교훈 기록은 `.crew/memory/{agent-slug}/MEMORY.md`에 둔다(플러그인 `agents/*.md`에 날짜 항목·회고 기록 금지).

## 6. 이력 관리

- MEMORY.md 항목 상한·보존은 `references/agent-memory.md`를 따른다: 파일당 최대 10항목, 6개월 경과 항목 삭제.
- 기존 `.crew/memory/{agent}/improvements/*.md` 파일은 **삭제하지 않되**(감사 추적), 신규 생성하지 않고 참조만 한다.

## 7. 에이전트 정의 분량 상한 규칙 (NFR-2)

에이전트 정의 본문이 비대해지면 컨텍스트 로드 비용 증가·유지보수 저해가 발생한다. 신규 에이전트 등록(specialist-registration-checklist.md §5 검증) 및 Evolution Hook §5 적용 시 다음 상한을 강제한다.

### 7.1 본문 총 분량

| 조건 | 조치 |
|------|------|
| 본문 **300줄 초과** | `references/`로 분리 **의무** (초과 시 등록/개선 게이트 BLOCK) |
| 본문 250줄 초과 ~ 300줄 이하 | 분리 **권고** (다음 사이클 리팩터링 대상 등록) |
| 본문 250줄 이하 | 조치 불필요 |

- 측정: `wc -l agents/{slug}.md` (frontmatter 포함 본문 전체)
- 구조 계약상 이관 불가한 잔류 항목(spec의 "잔류" 컬럼 명시분)으로 인해 300줄 초과가 불가피한 경우 **CONDITIONAL**로 처리하고, 초과 사유·잔류 근거·2차 사이클 재분할 검토 여부를 `.crew/board.md` 백로그에 기록한다.

### 7.2 행동 규칙 항목 수

| 조건 | 조치 |
|------|------|
| `## 행동 규칙` 내 `-` 항목 **25건 초과** | 규칙 **ID화**(예: `R-01`, `P-A1`) + `references/agent-rules/{slug}-rules.md`로 **이관 의무** — **이관 없이는 등록/Evolution Hook 게이트 BLOCK**(§7.1 라인 게이트와 동급) |
| 25건 이하 | 조치 불필요 |

- 이관 시 본문에는 규칙 ID + 1줄 요약 + rules 파일 참조 링크만 stub으로 남긴다.
- 이관 후 `references/agent-rules/{slug}-rules.md`가 규칙 원문의 SSOT가 되며, 본문 stub과 rules 파일 간 규칙 ID 정합을 검증한다(NFR-3 diff MISSING 0건).
- **BLOCK 승격 근거**: 규칙 ID화 대상 파일이 라인 상한(§7.1)에는 미달하더라도(전부 300줄 미만) 행동 규칙 과밀은 로드 비용·유지보수를 저해하므로, 항목 수 게이트를 라인 게이트와 동급 BLOCK 조건으로 강제한다.

### 7.3 근거

- 출처: `plan_모델재분배프롬프트세분화` FR-S4 — 교차 6파일 리팩터링 선례(pipeline-orchestrator/product-strategy/backend-engineering/platform-devops/design-director/guide-decomposer)에서 본문 300줄 이하 수렴 + 규칙 ID화 이관을 실증. `references/agent-rules/*-rules.md` 6종 신설.

## 8. 정의 파일 작성 규약 (로드 다이어트 — spawn-load 최소화)

에이전트 정의 파일(`agents/*.md`)은 spawn 시 harness가 컨텍스트로 무조건 주입하므로, 무조건 로드(L1) 분량을 최소화한다. 신규 에이전트 등록 및 Evolution Hook(§5) 적용 시 다음 규약을 강제한다. 로드 3계층(L0 상시 / L1 커맨드 사전 로드 / L2 온디맨드)의 트리거 소유권은 **커맨드**에 있으며, 정의 파일은 무조건 로드 술어를 소유하지 않는다.

### 8.1 조건부 참조 `[L2]` 토큰

- 온디맨드(분기 진입 시점에만 필요한) 참조 줄은 `[L2]` 토큰을 포함한다. `scripts/spawn-load.sh`는 `[L2]` 줄을 로드 마커 계수에서 제외한다(`grep -v '[L2]'`).
- 부착 대상: `agent-rules/{slug}-rules.md` 폴백·안내, layout/templates §지목 Read, Best Practice 조건부 로드, codex-delegation 폴백 줄.
- 부착 금지(L1/L0 유지): `.crew/config.md` §지목, `## 메모리` 2줄, 위임 상속 술어.
- 게이트: `grep -v '[L2]' agents/{slug}.md | grep -c "agent-rules/\|design-artifact-layout\|design-artifact-templates\|Best Practice 참조"` = 0.

### 8.2 무조건 Read 술어 금지

- "★ 작업 시작 시 반드시 Read" 같은 **무조건 로드 술어를 정의 파일에 두지 않는다.** 사전 로드가 필요한 L1 문서·구간은 커맨드가 위임 메시지의 `load_profile.refs`로 지목한다(트리거 소유권 = 커맨드).

### 8.3 `## 메모리` 2줄 고정

- `## 메모리` 절은 `references/agent-memory.md` 참조 2줄로 고정한다(항목 원문·형식을 정의 파일에 재기술 금지).

### 8.4 codex 위임 stub (헤딩 + 본문 ≤8줄)

- codex 위임 절은 헤딩 `## codex 추론 위임 (gpt-6.1-sol via MCP)`(마크다운 레벨은 파일 문맥 따라 `##`/`###` 허용, 문자열 "codex 추론 위임" 불변) + 본문 **≤8줄**(위임 문장 · `references/codex-delegation.md` 경로 폴백 · `codex sandbox:` 값 줄 · 위임 지점 · 미가용 폴백)로 제한하고, 절차 본문·`run_codex()` 정본·이중구조 설명·viz 태그·fallback 3단 체인은 `references/codex-delegation.md`(SSOT)에만 둔다. stub은 `find ~/.claude/plugins/cache … || find .` 폴백으로 참조한다(bare 경로 금지).
- 리터럴 2개(헤딩 문자열 "codex 추론 위임", `codex sandbox:` 값 줄)는 각각 게이트 판정의 유일 소스이므로 감축·재작성 시에도 **삭제 금지**(AC-7c/7d).
- 검증: `bash scripts/codex-block-lines.sh` → `FILES=16`, 파일당 블록(헤딩 포함) **≤9줄**.

### 8.5 gotchas·config 로드 규약

- `.crew/gotchas.md`를 **정의 파일에서 직접 로드하지 않는다.** 필요한 gotcha는 커맨드 위임 메시지의 `gotchas` 필드(ID 발췌)로 전달한다.
- `.crew/config.md`는 전문 로드 대신 필요한 **§만 지목**하여 참조한다.

### 8.6 런타임 스냅샷 stale (NFR-6)

- harness는 **세션 시작 시 에이전트 정의를 스냅샷**한다. 따라서 정의 파일(`agents/*.md`)·레퍼런스 변경은 **동일 세션 내에서는 반영되지 않고, 새 세션에서만 유효**하다.
- 검증은 정의 변경 커밋 후 **신규 세션에서 대표 에이전트 1회 spawn**하여 주입된 정의가 변경본(다이어트본)인지 트랜스크립트로 확인한다. **정의 파일을 다시 Read하는 것으로는 세션 스냅샷의 stale 여부를 판별할 수 없다.**

### 8.7 검증 명령

정의 파일 변경 후 다음을 실행하여 게이트를 판정한다(각 exit 0 / 목표치 충족):

- `scripts/spawn-load.sh` — 정의별 무조건 로드(L1/L0) 줄 수 계측(`[L2]` 제외)
- `scripts/check-load-profile.sh` — 커맨드 spawn 블록의 `load_profile`/exempt 마커 발행 검증
- `scripts/check-exempt-guards.sh` — exempt 마커 유효성(inherits §명 실재·허용 목록) 검증
- `scripts/check-heavy-exempt.sh` — 과다 로드 정의의 예외 등록 여부 점검
- `scripts/validate-agent-sync.sh` — repo↔cache 정의 동기화 diff 0(exit 0)
