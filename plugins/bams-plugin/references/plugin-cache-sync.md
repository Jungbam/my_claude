# Plugin Cache 동기화 SOP

## 캐시 위치
- Global: `~/.claude/plugins/cache/{marketplace_id}/{plugin_name}/{version}/`
  - 실경로 예: `~/.claude/plugins/cache/my-claude/bams-plugin/2.1.0/`
  - **경로 하드코딩 금지** — 캐시 루트는 `scripts/resolve-cache.sh`(installed_plugins.json 의 `plugins."bams-plugin@my-claude"[].installPath`)로 확정한다. `ls -dt`/`sort -V | tail -1` 같은 최신·최고버전 추정은 금지(2.4.0/2.1.0 드리프트 시 존재하지 않는 디렉터리를 선택할 위험). 후보가 정확히 1이 아니면 `resolve-cache.sh`는 exit≠0으로 게이트를 차단한다.
- 로컬 dev: `plugins/{plugin_name}/` (source — 변경 시 즉시 반영)

## 런타임 경로 해석 (커맨드·스킬·에이전트·references 공통 스니펫)

`scripts/resolve-cache.sh`는 repo 고정 운영 도구라 사용자 프로젝트에서 실행되는 커맨드·스킬은 부를 수 없다. 그래서 문서 안 bash 블록은 아래 **한 줄 스니펫**을 그대로 쓴다(글자 하나 바꾸지 않는다 — `scripts/check-cache-resolver.sh`가 대조).

```bash
_BAMS=$(sed -n '/"bams-plugin@my-claude"/,/"installPath"/s/.*"installPath": *"\([^"]*\)".*/\1/p' ~/.claude/plugins/installed_plugins.json 2>/dev/null); [ -d "$_BAMS" ] || _BAMS=$(ls -dt ~/.claude/plugins/cache/*/bams-plugin/*/ 2>/dev/null | head -1); _BAMS=${_BAMS%/}
X="$_BAMS/skills/ship/SKILL.md"; [ -e "$X" ] || X=""      # 사용 예: 없으면 빈 값(기존 '못 찾음' 분기 유지)
```

- 1순위: `installed_plugins.json`의 `bams-plugin@my-claude` installPath — Claude Code가 실제 로드하는 폴더, `sync-cache.sh`가 최신으로 유지.
- 2순위(installPath 부재·폴더 없음): 캐시의 bams-plugin 버전 폴더 중 **mtime 최신**.
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
