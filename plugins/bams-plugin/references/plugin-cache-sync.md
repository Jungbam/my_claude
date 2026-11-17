# Plugin Cache 동기화 SOP

## 캐시 위치
- Global: `~/.claude/plugins/cache/{marketplace_id}/{plugin_name}/{version}/`
  - 실경로 예: `~/.claude/plugins/cache/my-claude/bams-plugin/2.1.0/`
  - **경로 하드코딩 금지** — 캐시 루트는 `scripts/resolve-cache.sh`(installed_plugins.json 의 `plugins."bams-plugin@my-claude"[].installPath`)로 확정한다. `ls -dt`/`sort -V | tail -1` 같은 최신·최고버전 추정은 금지(2.4.0/2.1.0 드리프트 시 존재하지 않는 디렉터리를 선택할 위험). 후보가 정확히 1이 아니면 `resolve-cache.sh`는 exit≠0으로 게이트를 차단한다.
- 로컬 dev: `plugins/{plugin_name}/` (source — 변경 시 즉시 반영)

## 런타임 경로 해석 (커맨드·스킬·에이전트·references 공통 스니펫)

`scripts/resolve-cache.sh`는 repo 고정 운영 도구라 사용자 프로젝트에서 실행되는 커맨드·스킬은 부를 수 없다. 그래서 문서 안 bash 블록은 아래 **한 줄 스니펫**을 그대로 쓴다(글자 하나 바꾸지 않는다 — `scripts/check-cache-resolver.sh`가 대조).

```bash
_BAMS=$( { jq -r '[.plugins["bams-plugin@my-claude"] // empty] | flatten | sort_by(.scope != "user") | .[].installPath // empty' ~/.claude/plugins/installed_plugins.json; sh -c 'ls -dt "$HOME"/.claude/plugins/cache/*/bams-plugin/*/'; } 2>/dev/null | while IFS= read -r _p; do [ -d "$_p" ] && [ ! -e "$_p/.orphaned_at" ] && echo "${_p%/}" && break; done || true)
X="$_BAMS/skills/ship/SKILL.md"; [ -e "$X" ] || X=""      # 사용 예: 없으면 빈 값(기존 '못 찾음' 분기 유지)
```

- 1순위: `installed_plugins.json`의 `plugins."bams-plugin@my-claude"` 항목을 **JSON 파서(jq)**로 읽는다(배열·구형 단일 객체 모두, minify 무관) — `scope: "user"` 항목을 먼저, 그다음 나머지 순서로 보고 **installPath 폴더가 실제로 있고 `.orphaned_at` 표시가 없는 첫 항목**을 쓴다. Claude Code가 실제 로드하는 폴더이며 `sync-cache.sh`가 최신으로 유지한다. (구 `sed` 줄 파서는 JSON이 한 줄로 minify되면 다른 플러그인 경로를 집고, 항목이 여럿이면 scope와 무관하게 첫 항목을 집었다 — QA m5.)
- 2순위(JSON 부재·깨짐·jq 없음·installPath 폴더 없음): 캐시의 bams-plugin 버전 폴더 중 **`.orphaned_at`가 없는** 것 가운데 mtime 최신. 고아 폴더(구 버전 사본)는 고르지 않는다. 구현: 1순위 후보(jq 출력)와 2순위 후보(`ls -dt`)를 한 줄씩 이어 받아 "폴더가 있고 `.orphaned_at`가 없는 첫 줄"을 고른다(끝 `/` 제거).
- 셸 안전: 폴백 glob은 `sh -c` 안에서 펼쳐 zsh `no matches found` 노이즈가 없고, 모든 실패 경로가 `|| true`로 끝나 `set -euo pipefail` 블록에서도 멈추지 않는다(해석 실패 = `_BAMS` 빈 값). 설치본이 없으면 `_BAMS`는 빈 값이다.
- 검증: `tests/hooks/run-hook-tests.sh` "런타임 캐시 리졸버" 섹션(minify·다중 항목·구형 객체·JSON 부재/깨짐·jq 없음·설치 없음·bash/zsh·`set -euo pipefail`). jq는 hook(verdict-gate 등)도 요구하는 의존성이고 macOS 15+ 기본 탑재라 python3 폴백은 두지 않았다(스니펫 길이 = 모든 복사본의 컨텍스트 비용).
- **금지**: 캐시 루트 전체를 `find`로 훑고 첫 줄을 고르는 방식. 고아 버전 폴더(예: 2.5.0)가 먼저 나와 구 사본을 로드한다(v2.9.0 이전 실제 결함). `scripts/check-cache-resolver.sh`(validate-harness [8])가 재등장 시 FAIL.
- 조건부로 쓸 때는 블록으로 감싼다: `[ -z "$X" ] && { <스니펫>; X="$_BAMS/…"; }` — `A && 스니펫; X=…`는 스니펫 첫 명령만 조건부가 된다.

## stale 증상
- 신규 specialist 정의가 인식 안 됨 (예: PR #12 9 specialist 추가 후 spawn 안 됨)
- best-practice Read 시 placeholder 빈 내용
- frontmatter 변경(예: model: opus → sonnet) 미반영

## 해소 절차
1. 캐시 루트 확정(SSOT):
   ```bash
   CACHE_ROOT="$(bash plugins/bams-plugin/scripts/resolve-cache.sh)"
   echo "$CACHE_ROOT"   # 예: ~/.claude/plugins/cache/my-claude/bams-plugin/2.1.0
   ```
2. source → cache 동기화:
   ```bash
   bash plugins/bams-plugin/sync-cache.sh          # 캐시 경로도 resolve-cache.sh SSOT 사용
   ```
3. plugin.json `version` bump 후 머지 → 다음 세션에서 새 버전 자동 로드
4. 즉시 해소 필요 시 stale 버전 제거:
   ```bash
   rm -rf ~/.claude/plugins/cache/my-claude/bams-plugin/{old_version}/
   ```
5. Claude Code 세션 재시작
6. `validate-agent-sync.sh` **12/12 OK** 확인 (내부 [12/12]가 repo↔cache `diff -rq` 로 동기 검증)

## 자동화 후보 (별도 plan)
- post-merge hook으로 캐시 invalidate
- plugin version 변경 감지 자동 reload

## 관련 이슈
- D-001 (deep-review_PR13머지검증_20260630 §3.2 PA-5): plugin cache stale 자동 검증 부재
  → **해소**: `validate-agent-sync.sh` [12/12] repo↔cache diff(agents/references/commands) + `resolve-cache.sh` installPath SSOT 로 상시 검증. diff≥1 또는 `CACHE_ROOT` 해석 실패 시 exit 1 → R-2 트리거(전 Phase 즉시 중단).
