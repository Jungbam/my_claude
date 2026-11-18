## 공통 셸 도우미 (`references/linear-protocol.md` §3·§4·§9)

Bash 호출 사이에는 함수가 남지 않는다. 장부·fingerprint를 다루는 Bash 호출마다 이 블록을 맨 앞에 붙인다.

```bash
_lin() { sed -n '/^## Linear/,/^## /p' .crew/config.md 2>/dev/null | sed -n "s/^- $1: *//p" | head -1; }
bams_fp() { # $1=위치(파일 경로 또는 url:/경로) $2=카테고리 $3=제목 → 12자리
  _t=$(printf '%s' "$3" | tr '[:upper:]' '[:lower:]' | sed -E 's/[`"'"'"']//g; s/[0-9]+//g; s/[[:space:]]+/ /g; s/^ //; s/ $//')
  _l=$(printf '%s' "$1" | sed -E 's/:[0-9]+(-[0-9]+)?$//')
  printf 'v1|%s|%s|%s' "$_l" "$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')" "$_t" | shasum -a 256 | cut -c1-12
}
_LEDGER=.crew/linear-issues.json; _PENDING=.crew/linear-pending.json
[ -f "$_LEDGER" ] || printf '{"version":1,"team":"%s","project":"%s","issues":{}}\n' "$(_lin team)" "$(_lin project)" > "$_LEDGER"
ledger_get() { jq -c --arg k "$1" '.issues[$k] // empty' "$_LEDGER"; }
ledger_put() { _x=$(mktemp); jq --arg k "$1" --argjson v "$2" '.issues[$k] = ((.issues[$k] // {}) + $v)' "$_LEDGER" > "$_x" && mv "$_x" "$_LEDGER"; }
pend_add() { [ -f "$_PENDING" ] || echo '{"version":1,"ops":[]}' > "$_PENDING"; _x=$(mktemp); jq --argjson o "$1" '.ops += [$o]' "$_PENDING" > "$_x" && mv "$_x" "$_PENDING"; }
_now() { date -u +%FT%TZ; }
```

- 장부 값은 `jq -nc --arg …`로 만들어 `ledger_put <fp> '<json>'`에 넘긴다(문자열을 손으로 이어 붙이지 않는다).
- 쓰기는 Bash(jq·임시 파일·`mv`)로만 한다. issue-ops는 Write/Edit 도구가 없다.
- 시작할 때 `jq '.ops | length' "$_PENDING"`이 1 이상이면 그 작업부터 다시 실행하고, 성공한 항목은 `ops`에서 뺀다.
