# Plugin Cache 동기화 SOP

## 캐시 위치
- Global: `~/.claude/plugins/cache/marketplaces/{marketplace_id}/{plugin_name}/{version}/`
  - 예: `~/.claude/plugins/cache/my-claude/bams-plugin/2.2.0/`
- 로컬 dev: `plugins/{plugin_name}/` (source — 변경 시 즉시 반영)

## stale 증상
- 신규 specialist 정의가 인식 안 됨 (예: PR #12 9 specialist 추가 후 spawn 안 됨)
- best-practice Read 시 placeholder 빈 내용
- frontmatter 변경(예: model: opus → sonnet) 미반영

## 해소 절차
1. 캐시 디렉터리 확인:
   ```bash
   ls ~/.claude/plugins/cache/my-claude/bams-plugin/
   ```
2. plugin.json `version` bump 후 머지 → 다음 세션에서 새 버전 자동 로드
3. 즉시 해소 필요 시:
   ```bash
   rm -rf ~/.claude/plugins/cache/my-claude/bams-plugin/{old_version}/
   ```
4. Claude Code 세션 재시작
5. `validate-agent-sync.sh` 13/13 OK 확인

## 자동화 후보 (별도 plan)
- post-merge hook으로 캐시 invalidate
- plugin version 변경 감지 자동 reload

## 관련 이슈
- D-001 (deep-review_PR13머지검증_20260630 §3.2 PA-5): plugin cache stale 자동 검증 부재
