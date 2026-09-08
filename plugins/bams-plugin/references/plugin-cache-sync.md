# Plugin Cache 동기화 SOP

## 캐시 위치
- Global: `~/.claude/plugins/cache/{marketplace_id}/{plugin_name}/{version}/`
  - 실경로 예: `~/.claude/plugins/cache/my-claude/bams-plugin/2.1.0/`
  - **경로 하드코딩 금지** — 캐시 루트는 `scripts/resolve-cache.sh`(installed_plugins.json 의 `plugins."bams-plugin@my-claude"[].installPath`)로 확정한다. `ls -dt`/`sort -V | tail -1` 같은 최신·최고버전 추정은 금지(2.4.0/2.1.0 드리프트 시 존재하지 않는 디렉터리를 선택할 위험). 후보가 정확히 1이 아니면 `resolve-cache.sh`는 exit≠0으로 게이트를 차단한다.
- 로컬 dev: `plugins/{plugin_name}/` (source — 변경 시 즉시 반영)

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
