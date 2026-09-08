#!/usr/bin/env bash
# resolve-cache.sh — 캐시 플러그인 루트를 installed_plugins.json installPath로 확정.
# 후보≠1이면 exit≠0. 경로 하드코딩/`ls -dt`·`sort -V` 추정 금지 (design-infra §5-1 SSOT).
# 실행 위치: repo 고정. 캐시 사본 실행 금지 (scripts/는 repo-fixed 운영 도구).
set -u
IP="$HOME/.claude/plugins/installed_plugins.json"
[ -f "$IP" ] || { echo "FAIL: installed_plugins.json 부재" >&2; exit 2; }
PATHS=$(python3 - "$IP" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
e=(d.get("plugins") or {}).get("bams-plugin@my-claude")   # 키는 plugins 하위 중첩
if isinstance(e,dict): e=[e]
for it in (e or []):
    p=it.get("installPath")
    if p: print(p)
PY
)
N=$(printf '%s\n' "$PATHS" | grep -c .)
[ "$N" -eq 1 ] || { echo "FAIL: installPath 후보=$N (정확히 1이어야 함)" >&2; exit 3; }
[ -d "$PATHS" ] || { echo "FAIL: installPath 디렉터리 부재: $PATHS" >&2; exit 4; }
echo "$PATHS"
