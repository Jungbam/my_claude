# Feature: Phase 0 — 파이프라인 초기화

> 이 파일은 `/bams:feature`의 Phase 0을 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다 (엔트리포인트에서 이미 로드됨).

## 입력 컨텍스트

- slug: {엔트리포인트에서 결정된 slug}
- feature_description: {$ARGUMENTS}
- 이전 Phase 산출물: 없음 (초기 Phase)

---

## Step 0. resource-optimizer 전략 수립

Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_start "{slug}" 0 "파이프라인 초기화" "Phase 0: 초기화"
```

pipeline-orchestrator에게 파이프라인 초기화를 지시합니다.

Bash로 agent_start를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_start "{slug}" "pipeline-orchestrator-0-$(date -u +%Y%m%d)" "pipeline-orchestrator" "sonnet" "Step 0: 파이프라인 초기화 위임"
```

서브에이전트 실행 (Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"**, model: **"sonnet"**):

> **파이프라인 초기화 모드**로 feature 파이프라인을 준비합니다.
>
> **위임 메시지:**
> ```
> phase: 0
> slug: {slug}
> pipeline_type: feature
> context:
>   config: .crew/config.md
>   board: .crew/board.md
>   feature_description: {$ARGUMENTS}
> constraints:
>   user_note: "{사용자 지시사항이 있으면 삽입}"
> ```
>
> **수행할 작업:**
> 1. resource-optimizer를 호출하여 파이프라인 유형(feature)과 규모를 전달하고, 각 에이전트별 모델 선택(opus/sonnet/haiku)과 병렬화 전략을 조회합니다. feature는 dev보다 확장된 파이프라인이므로 검증/배포/마무리 Phase의 리소스도 계획합니다.
> 2. executive-reporter를 호출하여 `pipeline_start` 이벤트를 기록 요청합니다.
> 3. Pre-flight 체크리스트를 확인합니다: config.md, gotchas, 기존 아티팩트 존재 여부.
> 4. 파이프라인 실행 계획을 수립하여 보고합니다 (13단계 전체 범위).
>
> **기대 산출물**: 파이프라인 실행 계획 (모델 전략, 병렬화 가능 구간, 예상 Phase 수, 게이트 조건)

orchestrator 반환 후, Bash로 agent_end를 emit합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" agent_end "{slug}" "pipeline-orchestrator-0-$(date -u +%Y%m%d)" "pipeline-orchestrator" "success" {duration_ms} "Step 0 완료: 파이프라인 실행 계획 수립"
```

pipeline-orchestrator의 실행 계획을 수신하고, 이후 Phase에서 이 계획(모델 전략, 병렬화 전략)을 참조합니다.

Step 0 완료 시, Bash로 다음을 실행합니다:
```bash
_EMIT=$(find ~/.claude/plugins/cache -name "bams-viz-emit.sh" -path "*/bams-plugin/*" 2>/dev/null | head -1); [ -n "$_EMIT" ] && bash "$_EMIT" step_end "{slug}" 0 "done" {duration_ms}
```

---

## Phase 0 게이트 조건

- [ ] resource-optimizer 실행 계획 수신 완료
- [ ] pipeline_start 이벤트 기록 완료
- [ ] Pre-flight 체크리스트 통과
- [ ] 파이프라인 실행 계획 수립 완료

Phase 0 완료 → 엔트리포인트가 Phase 1 (기획)을 라우팅합니다.
