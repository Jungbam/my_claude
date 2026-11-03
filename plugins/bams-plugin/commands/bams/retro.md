---
description: 파이프라인 회고 + 개선 — 평가부서/총괄팀 주도
argument-hint: "[all | {slug} | 빈값=최근5개]"
---

# Bams: Retro

파이프라인 이력 기반 정성 회고·개선. 3개 Phase, product-analytics + pipeline-orchestrator(조언자) 주도. 메인이 각 Phase 파일 지시에 따라 대상 에이전트를 직접 spawn한다(`_shared_common.md` §위임 원칙 + 부록 루프 A/B). 절차·학습 루프 SSOT: `references/retro-protocol.md`.

입력: $ARGUMENTS

## 인수 파싱

1. 비어있음 → `TARGET_SCOPE = "recent5"` (최근 5개 파이프라인)
2. "all" → `TARGET_SCOPE = "all"`
3. "--since {N}d" → `TARGET_SCOPE = "since_{N}d"`
4. 그 외 → `TARGET_SCOPE = "slug:{값}"`

## 사전 조건

**Step 1**: `.crew/config.md`가 없으면 "프로젝트가 초기화되지 않았습니다. `/bams:init`을 실행하세요." 출력 후 중단.

**Step 2**: 완료 기록 확인.

```bash
if [ ! -s .crew/history.md ] || ! grep -qE '^## [0-9]{4}-[0-9]{2}-[0-9]{2}' .crew/history.md 2>/dev/null; then
  echo "파이프라인 완료 기록이 없습니다. /bams:dev 또는 /bams:feature를 먼저 실행하세요."
  exit 0
fi
```

**Step 3**: 특정 slug면 history.md에 완료 기록이 있는지 확인. 없으면 slug 목록을 출력하고 재입력 요청:

```bash
grep -oE '## [0-9]{4}-[0-9]{2}-[0-9]{2} \| [^ ]+' .crew/history.md 2>/dev/null | awk '{print $4}' | sort -u
```

## 공통 규칙 로드

`plugins/bams-plugin/commands/bams/retro/_common.md`를 Read한다.

## Slug 결정

```bash
case "{TARGET_SCOPE}" in
  all) SCOPE_KR="전체회고" ;;
  recent5) SCOPE_KR="최근5회고" ;;
  since_*) SCOPE_KR="최근${TARGET_SCOPE#since_}회고" ;;
  slug:*) SCOPE_KR="${TARGET_SCOPE#slug:}회고" ;;
esac
BASE="retro_${SCOPE_KR}"
EXISTING=$(ls -d .crew/artifacts/retro/${BASE}* 2>/dev/null | wc -l | tr -d ' ')
SLUG="${BASE}_$((EXISTING + 1))"
echo "[retro] slug: $SLUG"
```

## Phase 라우팅

각 Phase 파일을 Read해 순서대로 진행하고, 게이트 확인 후 다음 Phase로 넘어간다.

| Phase | 파일 | 내용 |
|-------|------|------|
| Phase 1 | `plugins/bams-plugin/commands/bams/retro/phase-2-retro.md` | KPT 회고 (참여 부서장 병렬) |
| Phase 2 | `plugins/bams-plugin/commands/bams/retro/phase-4-improve.md` | 개선 → hr-agent 적용 |
| Phase 3 | `plugins/bams-plugin/commands/bams/retro/phase-5-report.md` | 종합 보고 (product-analytics) |

공통 준수:
- spawn 프롬프트에는 이전 Phase 산출물 **경로**만 넘긴다(요약 붙여넣기 금지). 부서장 반환은 `delegation-protocol.md` §2-5 보고 계약.
- 교훈은 MEMORY.md 항목 갱신(`retro-protocol.md` §5-2: 신뢰도·seen·90일 TTL·10항목 상한)으로만 남긴다.
- 정의 파일 개선안은 `agent-improvement-protocol.md` §5 게이트(seen ≥3 + high + 순증가 0)와 형식(**삭제/대체할 기존 문장** 필드 필수)을 따른다. 게이트 미달 개선안은 MEMORY.md 갱신으로 대체한다.

## 마무리

`.crew/history.md`에 완료 블록을 기록한다(`_shared_common.md` §파이프라인 완료 기록). 회고 자체에 대해서는 하위 회고를 트리거하지 않는다.
