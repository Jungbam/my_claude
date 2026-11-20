## 공통 셸 도우미 (`references/linear-protocol.md` §3·§4)

Bash 호출 사이에는 함수가 남지 않는다. 매핑·지문을 다루는 Bash 호출마다 이 블록을 맨 앞에 붙인다.

```bash
_lin() { sed -n '/^## Linear/,/^## /p' .crew/config.md 2>/dev/null | sed -n "s/^- $1: *//p" | head -1; }
_repo() { _r=$(git remote get-url origin 2>/dev/null); basename "${_r:-$(git rev-parse --show-toplevel 2>/dev/null)}" .git | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-//; s/-$//'; }
bams_fp() { # $1=위치(파일 경로 또는 url:/경로) $2=카테고리 $3=제목 → 12자리
  _t=$(printf '%s' "$3" | tr '[:upper:]' '[:lower:]' | sed -E 's/[`"'"'"']//g; s/[0-9]+//g; s/[[:space:]]+/ /g; s/^ //; s/ $//')
  _l=$(printf '%s' "$1" | sed -E 's/:[0-9]+(-[0-9]+)?$//')
  printf 'v1|%s|%s|%s' "$_l" "$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')" "$_t" | shasum -a 256 | cut -c1-12
}
bams_src() { printf 'bams:%s/%s' "$(_repo)" "$(bams_fp "$1" "$2" "$3")"; }   # 출처 ID 값
```

- 출처 ID 검색은 값을 큰따옴표로 감싼 문자열을 `query`에 넣는다: `"bams:<repo>/<fp>"`. `team` 없이 찾는다.
- 로컬 쓰기는 Bash(heredoc·awk·임시 파일·`mv`)로만 한다. issue-ops는 Write/Edit 도구가 없다. 쓰는 곳은 `.crew/config.md` `## Linear`와 `.crew/artifacts/linear/draft-*.md`뿐이다.
