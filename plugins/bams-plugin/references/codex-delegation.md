# codex 추론 위임 — 공용 SSOT (gpt-5.6-luna via MCP)

> 16개 FE/디자인 정의 파일의 `## codex 추론 위임` stub이 참조하는 공통 본문. 파일별 상이 값은 `{...}` 파라미터로 각 정의 stub이 주입한다(§파라미터 표). 원문 대표 문장 `gpt-5.6-luna(OpenAI codex)에 위임`은 본 파일에만 존재한다(NFR-7).

## A. 위임 개요

핵심 추론({agent_scope})을 gpt-5.6-luna(OpenAI codex)에 위임한다. Claude 컨트롤러({controller_model}, {harness_tier} harness)는 입력 전처리·출력 검증·도구 호출·산출물 저장만 담당하고, 실제 추론/생성은 codex가 수행한다.

## B. 이중 구조 (재발 방지 핵심)

frontmatter `model: {controller_model}`은 Agent/Task tool이 spawn하는 **Claude 컨트롤러 모델**이며 하드 제약상 claude-* 계열만 허용된다 — 여기에 gpt 모델명을 넣으면 spawn이 전면 실패한다. **실제 추론 모델**은 이와 완전히 별개로, 본문에서 `mcp__codex__codex`에 위임하는 gpt-5.6-luna다. 두 개념(Agent/Task tool `model` 파라미터 ≠ 실행 위임 모델)의 혼동이 과거 2회 오진·재발 원인이었다.

## C. 1차 경로 — `mcp__codex__codex` MCP 도구 (권장)

- `prompt`: 위임 작업 지시문 · `model`: `"gpt-5.6-luna"` (viz 로그 명확성 위해 명시; 생략 시 `~/.codex/config.toml` 기본값)
- `sandbox`: `"{sandbox}"` ({sandbox_rationale}) · `cwd`: 대상 프로젝트 루트 절대경로 · `approval-policy`: `"never"` (비대화형 파이프라인)
- 멀티턴 후속 위임: 반환된 `threadId`로 `mcp__codex__codex-reply` 호출해 세션을 이어간다.
- codex 응답은 그대로 채택하지 않고 Claude가 검증·통합 후 최종 산출물을 생성한다.

## D. viz via 태그

MCP 성공 `via gpt-5.6-luna (codex MCP)` / CLI fallback `via gpt-5.6-luna (codex CLI(fallback))` / 최후 수단 `via {harness_tier}[fallback:codex-unavailable]`.

## E. 2차 경로 (fallback) — Bash codex CLI

도구 목록에 `mcp__codex__codex`가 없거나 MCP 서버 미연결 시 사용한다. 정본 `run_codex()`는 전 파일 공통(파라미터 무주입).

```bash
_CODEX_MODEL="gpt-5.6-luna"
_CODEX_TIMEOUT=120

codex_available() {  # 인증/설치 상태 확인
  command -v codex >/dev/null 2>&1 || return 1
  codex auth status >/dev/null 2>&1 || [ -n "$(jq -r '.auth_mode // empty' ~/.codex/auth.json 2>/dev/null)" ]
}

run_codex() {  # $1=prompt, $2=sandbox(read-only|workspace-write)
  codex_available || { echo "[codex-fallback] 미가용 — 컨트롤러 직접 처리" >&2; return 1; }
  timeout "$_CODEX_TIMEOUT" \
    codex exec -m "$_CODEX_MODEL" "$1" -s "${2:-read-only}" \
      -c 'model_reasoning_effort="xhigh"' --json 2>/dev/null \
    | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        obj = json.loads(line)
        if obj.get('type') == 'item.completed':
            item = obj.get('item', {})
            if item.get('type') == 'message':
                for c in item.get('content', []):
                    if c.get('type') == 'output_text':
                        print(c.get('text', ''))
    except: pass
"
}
```

## F. fallback 3단 체인

`mcp__codex__codex`(1차, model gpt-5.6-luna) → Bash `run_codex()` CLI(2차) → {fallback_policy}(3차). CLI마저 미가용이면 — {fallback_policy}가 `escalate`이면 `{escalation_target}`에 에스컬레이션 후 대기, `direct`이면 Claude 컨트롤러가 직접 처리한다.

## G. 자동 fallback 금지 정책 (OQ10=b)

`{fallback_policy}`가 `escalate`인 specialist는 codex 미가용 시 **자동 sonnet fallback을 수행하지 않고** `{escalation_target}`에 보고 후 대기한다. 부서장(`direct`)만 컨트롤러 직접 처리를 허용한다.

## 파라미터 (정의 stub이 주입)

| 파라미터 | 값 |
|---------|-----|
| `{agent_scope}` | 핵심 추론 범위 1문장 |
| `{sandbox}` | `read-only` \| `workspace-write` |
| `{sandbox_rationale}` | 괄호 사유구(선택; 없으면 생략) |
| `{controller_model}` | `claude-opus-4-8` \| `claude-sonnet-5` |
| `{harness_tier}` | `opus` \| `sonnet` |
| `{delegation_points}` | 역할별 위임 지점/원칙 1~3줄 |
| `{fallback_policy}` | `escalate`(specialist: 자동 sonnet fallback 금지) \| `direct`(부서장: 컨트롤러 직접 처리) |
| `{escalation_target}` | `design-director` \| `self`(부서장 자체) |
