# 에이전트 개선 프로토콜 (Agent Improvement Protocol)

반복 실수를 MEMORY.md 항목으로 축적하고, 게이트를 통과한 것만 정의 파일로 승격한다. 회고 Phase 2, deep-review·hotfix finalization의 Evolution Hook이 이 문서를 따른다.

## 1. 기록

개선점은 `.crew/memory/{agent-slug}/MEMORY.md` 항목으로 기록한다(형식 `references/agent-memory.md`, 유지 규칙 `retro-protocol.md` §5-2). 별도 `improvements/*.md` 파일은 만들지 않는다(기존 파일은 삭제하지 않고 참조만).

## 2. lesson-id 체계

리뷰·hotfix 유래 항목의 `lesson-id`는 `{카테고리}:{태그}`로 쓴다 — 같은 id면 같은 교훈으로 보고 `seen`을 올린다.

| 카테고리 | 태그 예시 |
|---------|----------|
| `code-quality:` | `null-safety`, `error-handling`, `naming` |
| `architecture:` | `coupling`, `layer-violation`, `state-management` |
| `performance:` | `n-plus-one`, `memory-leak`, `bundle-size` |
| `security:` | `injection`, `auth-bypass`, `secret-exposure` |
| `test-coverage:` | `missing-edge-case`, `flaky-test`, `mock-abuse` |

## 3. severity

`minor`(스타일·사소한 비효율)는 기록하지 않는다. `major`(버그 가능성·유지보수 저해)는 기록. `critical`(보안·데이터 손실)은 기록과 함께 `.crew/gotchas.md` 후보로 즉시 사용자에게 제안한다 — 정의 파일 승격은 §5 게이트를 그대로 따른다.

## 4. 반복 판정

반복 여부는 항목의 `seen`(서로 다른 pipeline-slug 수)과 `conf`로만 판정한다. 호출 측 트리거(예: "structural + 2회")가 발동해도 §5 게이트 미달이면 MEMORY.md 갱신으로 끝낸다.

## 5. Evolution Hook (승격 게이트)

### 트리거 (모두 충족)

- `seen ≥ 3`(독립 관찰) · `conf: high` · 다중 프로젝트 재현 가능(`retro-protocol.md` §3-0)
- **순증가 0**: 추가 바이트 ≤ 같은 파일에서 삭제·압축한 바이트, `scripts/validate-harness.sh` WARN 수 증가 0(적용 전후 비교)
- 사용자 명시 승인

### 개선안 형식 (필수 필드)

```markdown
## 개선안: {agent-slug} ← {lesson-id} (seen N · conf high)
- 대상 파일: agents/{slug}.md §{섹션} | references/{doc}.md §{섹션}
- 추가 문장: {일반 규칙 1~3줄 — 날짜·회고 slug·프로젝트 경로·KPT 인용 금지}
- 삭제/대체할 기존 문장: {같은 파일 원문 인용. 비어 있으면 승격 불가}
- 바이트 증감: {after − before} (≤ 0)
```

### 실행

1. 게이트 충족 항목 수집 → 2. 개선안 작성 → 3. 사용자 승인 → 4. hr-agent가 적용(추가·삭제 동시) → 5. 승격된 항목을 MEMORY.md에서 삭제.

| 대상 | 수정 위치 |
|------|----------|
| 에이전트 행동 규칙 | `agents/{agent}.md` `## 행동 규칙` |
| 스킬 프로세스 | `commands/bams/{skill}.md` 해당 Step |
| 프로젝트 한정 | `.crew/gotchas.md`(gotchas-spec.md 승격 규칙) |

## 6. 이력

MEMORY.md 상한·TTL은 `retro-protocol.md` §5-2를 따른다.

## 7. 에이전트 정의 분량 상한

신규 등록(specialist-registration-checklist.md §5) 및 §5 적용 시 강제한다. `scripts/validate-harness.sh`의 WARN(본문 10,000자 초과)도 함께 본다.

### 7.1 본문 총 분량 (`wc -l agents/{slug}.md`, frontmatter 포함)

- **300줄 초과**: `references/`로 분리 의무 — 미분리 시 게이트 BLOCK. 구조상 이관 불가 잔류분 때문이면 CONDITIONAL + 사유·재분할 검토를 `.crew/board.md` 백로그에 기록.
- 250~300줄: 분리 권고(다음 사이클 대상). 250줄 이하: 조치 없음.

### 7.2 행동 규칙 항목 수

- `## 행동 규칙` 내 `-` 항목 **25건 초과**: 규칙 ID화(`R-01` 등) + `references/agent-rules/{slug}-rules.md`로 이관 의무 — 미이관 시 BLOCK(§7.1과 동급).
- 본문에는 규칙 ID + 1줄 요약 + rules 파일 링크 stub만 남기고, rules 파일이 원문 SSOT다(stub↔rules ID 정합 MISSING 0).

## 8. 정의 파일 작성 규약 (spawn-load 최소화)

정의 파일은 spawn 시 무조건 주입되므로 무조건 로드(L1) 분량을 줄인다. 로드 3계층(L0 상시 / L1 커맨드 사전 로드 / L2 온디맨드)의 트리거는 **커맨드**가 소유한다.

### 8.1 조건부 참조 `[L2]` 토큰

- 온디맨드 참조 줄에는 `[L2]`를 붙인다(`scripts/spawn-load.sh`가 계수에서 제외).
- 부착 대상: `agent-rules/{slug}-rules.md` 폴백·안내, layout/templates §지목 Read, Best Practice 조건부 로드, codex-delegation 폴백 줄. 부착 금지: `.crew/config.md` §지목, `## 메모리` 2줄, 위임 상속 술어.
- 게이트: `grep -v '[L2]' agents/{slug}.md | grep -c "agent-rules/\|design-artifact-layout\|design-artifact-templates\|Best Practice 참조"` = 0.

### 8.2 무조건 Read 술어 금지

"작업 시작 시 반드시 Read" 같은 술어를 정의 파일에 두지 않는다. 사전 로드는 커맨드가 `load_profile.refs`로 지목한다.

### 8.3 `## 메모리` 2줄 고정

`references/agent-memory.md` 참조 2줄로 고정한다(형식 재기술 금지).

### 8.4 codex 위임 stub (헤딩 + 본문 ≤8줄)

- 헤딩 `## codex 추론 위임 (gpt-6.1-sol via MCP)`(레벨 `##`/`###` 허용, 문자열 "codex 추론 위임" 불변) + 본문 ≤8줄(위임 문장 · `references/codex-delegation.md` 경로 폴백 · `codex sandbox:` 값 줄 · 위임 지점 · 미가용 폴백). 절차 본문은 `references/codex-delegation.md`(SSOT)에만 두고, stub은 `find ~/.claude/plugins/cache … || find .` 폴백으로 참조한다(bare 경로 금지).
- 리터럴 "codex 추론 위임"과 `codex sandbox:` 값 줄은 게이트 판정 소스이므로 삭제 금지.
- 검증: `bash scripts/codex-block-lines.sh` → `FILES=16`, 파일당 블록(헤딩 포함) ≤9줄.

### 8.5 gotchas·config 로드

`.crew/gotchas.md`는 정의 파일에서 직접 로드하지 않고 위임 메시지 `gotchas` 필드(ID 발췌)로 받는다. `.crew/config.md`는 필요한 §만 지목한다.

### 8.6 런타임 스냅샷 stale (NFR-6)

harness는 세션 시작 시 정의를 스냅샷하므로 정의·레퍼런스 변경은 **새 세션에서만** 유효하다. 검증은 커밋 후 신규 세션에서 대표 에이전트 1회 spawn해 주입된 정의를 트랜스크립트로 확인한다(파일 재Read로는 판별 불가).

### 8.7 검증 명령 (각 exit 0)

- `scripts/spawn-load.sh` — 정의별 무조건 로드 줄 수(`[L2]` 제외)
- `scripts/check-load-profile.sh` — spawn 블록 `load_profile`/exempt 마커 발행
- `scripts/check-exempt-guards.sh` — exempt 마커 유효성
- `scripts/check-heavy-exempt.sh` — 과다 로드 정의 예외 등록
- `scripts/validate-agent-sync.sh` — repo↔cache 동기화 diff 0
