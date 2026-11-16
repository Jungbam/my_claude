# Verdict 프로토콜 — SHA 결합 검증 판정 [L2]

> 온디맨드 문서. 릴리스 게이트 판정을 남기거나(review·release-quality-gate), 머지·배포 전에 확인할 때(ship·deploy) Read한다.
> 구현: `hooks/lib/verdict.sh`(쓰기·조회) + `hooks/verdict-gate.sh`(PreToolUse Bash 게이트). 테스트: `tests/hooks/run-hook-tests.sh` "verdict-gate" 섹션.

## 1. 왜

"검증했다"는 보고는 어떤 커밋을 누가 검증했는지가 빠지면 증거가 아니다. verdict는 **판정 대상 커밋(sha·patch-id)**, **판정자(구현자가 아닌 에이전트 + 모델)**, **증거(명령 + exit code)** 를 한 파일에 묶는다. 머지·배포 명령은 이 파일이 지금 HEAD와 맞을 때만 조용히 통과한다.

## 2. 파일

경로: `<repo>/.crew/artifacts/review/verdict-<shortsha>.json` (shortsha = `git rev-parse --short=12 HEAD`, 같은 커밋 재판정은 덮어씀)

| 필드 | 뜻 |
|------|----|
| `sha`, `short_sha`, `tree` | 판정 시점 HEAD 커밋·트리 |
| `base`, `patch_id` | `git diff $(git merge-base <base> HEAD) HEAD \| git patch-id --stable` — rebase·amend·squash로 sha가 바뀌어도 내용이 같으면 유효 |
| `dirty`, `untracked` | 미커밋 변경 기준 판정이면 `dirty: true`, patch-id는 작업 트리(추적 파일) 기준. 이때는 sha가 아니라 patch-id로만 매칭된다(새 파일은 포함 안 됨 → 커밋 후 재판정) |
| `verdict` | `PASS` \| `FAIL` |
| `judge` | `{agent, model, family}` — 판정한 에이전트와 모델. family = claude/openai/google/unknown |
| `author_agents`, `author_models` | 이번 변경을 구현한 에이전트·모델 |
| `same_family` | 판정 모델이 구현 모델과 같은 계열이면 `true`(독립성 약함 표시, 차단 아님), 모델 미상이면 `"unknown"` |
| `evidence` | `[{cmd, exit_code}]` — 판정자가 이번 커밋 기준으로 직접 확인한 검증 명령 |
| `pipeline`, `created_at` | 파이프라인 slug, UTC 시각 |

`verdict.sh write`가 거부하는 경우(exit 2): 판정자 ∈ `author_agents`(bams-plugin: 접두사 무시) · PASS인데 evidence 없음 · PASS인데 exit≠0 evidence 포함 · git 저장소 아님.

## 3. 쓰기 (판정자)

```bash
_BAMS=$(sed -n '/"bams-plugin@my-claude"/,/"installPath"/s/.*"installPath": *"\([^"]*\)".*/\1/p' ~/.claude/plugins/installed_plugins.json 2>/dev/null); [ -d "$_BAMS" ] || _BAMS=$(ls -dt ~/.claude/plugins/cache/*/bams-plugin/*/ 2>/dev/null | head -1); _BAMS=${_BAMS%/}; _VD="$_BAMS/hooks/lib/verdict.sh"; [ -e "$_VD" ] || _VD=""; [ -z "$_VD" ] && _VD=$(find . -path "*/bams-plugin/hooks/lib/verdict.sh" 2>/dev/null | head -1)
bash "$_VD" write --verdict PASS --judge-agent release-quality-gate --judge-model <판정 모델> \
  --author-agents frontend-engineering,backend-engineering --author-models claude-opus-5-5 \
  --evidence "0:bun test" --evidence "0:bunx tsc --noEmit" --pipeline <slug> [--base origin/main]
```

- **판정자 분리**: 판정자는 이번 변경을 구현한 에이전트가 아니어야 한다(기본 release-quality-gate, 없으면 qa-strategy). 메인 대화가 직접 구현한 변경이면 `--author-agents main`.
- **다른 모델 우선**: ① Codex 연결 시(`ToolSearch("+codex")`로 `mcp__codex__*` 로드 성공, 또는 `codex` 스킬의 `codex review`) — diff + evidence를 Codex에 독립 판정시키고, 둘 다 PASS일 때만 PASS로 쓰며 `--judge-model codex:<모델>`을 기록한다. ② Codex 불가 시 — 게이트 spawn에 구현자와 다른 `model`을 지정한다(구현자 opus → 판정 `model: "sonnet"`, 구현자 sonnet → `"opus"`). ③ 둘 다 불가 — 같은 모델로 판정하되 `--judge-model`을 정확히 기록하면 `same_family: true`가 남는다. 보고서에 "same-family 판정"을 명시한다.
- **evidence는 직접 실행한 것만**: 구현자 보고의 "통과"를 옮겨 적지 않는다(`agents/release-quality-gate.md` §증거 기반 판정). FAIL 판정도 파일로 남긴다(게이트가 FAIL을 알아야 한다).
- `--base` 기본값: `origin/HEAD` → `origin/main` → `origin/master` → `main` → `master`. 원격 추적 브랜치를 쓰면 로컬 main이 오래돼도 patch-id가 안정적이다.

## 4. 확인 (ship·deploy·hook)

```bash
bash "$_VD" check     # stdout: "<pass|fail|invalid|none> <파일> <sha|patch_id> <same_family>"
```

| exit | 뜻 | ship/deploy 처리 |
|------|----|------------------|
| 0 | HEAD와 sha 또는 patch-id가 맞는 PASS | 진행 |
| 1 | 맞는 verdict 없음(HEAD 이후 변경 포함) | release-quality-gate(ship·deploy Step 1, hotfix Step 4) 또는 `/bams:review`가 이번 HEAD 기준으로 판정·기록 후 재확인. 그래도 없으면 ship = CONDITIONAL GO(사용자 확인), deploy·hotfix 배포 = 중단 |
| 3 | 맞는 verdict가 FAIL | 중단 |
| 4 | 판정자 = 구현자(무효) | 다른 에이전트로 재판정 |

최신 20개 파일만 본다(mtime 순). sha 일치가 우선이고, 없으면 파일의 `base`마다 현재 patch-id를 1회 계산해 비교한다.

## 5. 게이트 hook (`hooks/verdict-gate.sh`, PreToolUse `Bash`)

- 수준: `BAMS_VERDICT_GATE=off|warn|strict` (기본 **warn** = additionalContext 안내, strict = deny). 우회가 필요하면 세션 환경변수로 `off`.
- 대상(명령 위치에 올 때만, 인자 속 문자열 무시): `gh pr merge` · base 브랜치(main·master·origin/HEAD)로 가는 `git push`(`HEAD:main`, `+feat:refs/heads/main`, refspec 없이 base에서 push, `--all/--mirror`) · `vercel … --prod` · `netlify deploy … --prod` · `fly|flyctl deploy`. `--dry-run`·`--delete`·`--help` 제외.
- 대상 커밋: push는 refspec의 src, 배포는 HEAD, `gh pr merge`는 PR 번호가 있거나 현재 브랜치가 base면 `gh pr view --json headRefOid`(네트워크, `BAMS_VERDICT_GH=off`로 끔), 아니면 HEAD.
- 적용 범위: 대상 저장소 최상위에 `.crew/`가 있을 때만. jq·git 부재, 파싱 실패, PR head 확인 불가는 모두 fail-open.
- 한계: 따옴표 안의 `;`·`&&`도 구분자로 본다(오탐은 warn 안내로 끝남). `bash deploy.sh`처럼 스크립트 안에 숨은 배포·MCP 배포 도구(ezar-infra `dev_build_trigger` 등)는 보지 않는다 — 이 경우 deploy.md Pre-flight·hotfix Step 5·feature Step 11의 `verdict.sh check`가 유일한 확인이다.
