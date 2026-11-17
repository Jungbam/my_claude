#!/usr/bin/env bash
# tests/verify-skill/run.sh — scripts/check-verify-skill.sh 회귀 테스트.
# fixtures/base 를 임시 git 리포에 복사해 변형별로 기대 exit code·RESULT 줄을 확인한다.
# 사용: bash tests/verify-skill/run.sh   (exit 0 = 전부 통과)
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
P="$(cd "$HERE/../.." && pwd)"
CHECK="$P/scripts/check-verify-skill.sh"
BASE="$HERE/fixtures/base"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/verify-skill-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

pass=0; failn=0
EVREL=".crew/artifacts/test/verify-todo-api/run-1"

# new_repo <name> <status> <commit|HEAD> <evidence-mode: file|empty|none>
new_repo() {
  local name="$1" status="$2" commit="$3" ev="$4" r="$TMP/$1"
  mkdir -p "$r/.claude/skills"
  git -C "$r" init -q
  echo seed > "$r/README.md"
  git -C "$r" add README.md
  git -C "$r" -c user.name=t -c user.email=t@t -c commit.gpgsign=false commit -qm init
  [ "$commit" = "HEAD" ] && commit="$(git -C "$r" rev-parse --short HEAD)"
  cp -R "$BASE" "$r/.claude/skills/verify-todo-api"
  local s="$r/.claude/skills/verify-todo-api/SKILL.md"
  local at="2026-11-16" feat="todo-create" evp="$EVREL/"
  if [ "$status" = "draft" ]; then commit=""; at=""; feat=""; evp=""; fi
  sed -e "s|__STATUS__|$status|" -e "s|__COMMIT__|$commit|" -e "s|__PROVEN_AT__|$at|" \
      -e "s|__FEATURE__|$feat|" -e "s|__EVIDENCE__|$evp|" "$s" > "$s.tmp" && mv "$s.tmp" "$s"
  case "$ev" in
    file)  mkdir -p "$r/$EVREL"; echo '{"id":1}' > "$r/$EVREL/todo-create.json" ;;
    empty) mkdir -p "$r/$EVREL"; : > "$r/$EVREL/zero-byte.txt" ;;
  esac
  echo "$r"
}

# expect <label> <want-exit> <want-result-regex> <skill-dir> [repo-root]
expect() {
  local label="$1" want="$2" re="$3"; shift 3
  local out rc
  out="$(bash "$CHECK" "$@" 2>&1)"; rc=$?
  if [ "$rc" = "$want" ] && printf '%s\n' "$out" | tail -1 | grep -Eq "$re"; then
    pass=$((pass+1)); echo "ok   $label (exit $rc)"
  else
    failn=$((failn+1)); echo "FAIL $label — want exit $want /$re/, got exit $rc"; printf '%s\n' "$out" | sed 's/^/     /'
  fi
}

SK=".claude/skills/verify-todo-api"

r=$(new_repo draft draft "" none);              expect "valid draft"               0 '^RESULT: draft$'  "$r/$SK"
r=$(new_repo proven proven HEAD file);          expect "valid proven"              0 '^RESULT: proven$' "$r/$SK"
r=$(new_repo badcommit proven deadbeef1 file);  expect "proven, unknown commit"    1 '^RESULT: FAIL'    "$r/$SK"
r=$(new_repo nocommit proven "" file);          expect "proven, empty commit"      1 '^RESULT: FAIL'    "$r/$SK"
r=$(new_repo emptyev proven HEAD empty);        expect "proven, empty evidence"    1 '^RESULT: FAIL'    "$r/$SK"
r=$(new_repo noev proven HEAD none);            expect "proven, missing evidence"  1 '^RESULT: FAIL'    "$r/$SK"

r=$(new_repo placeholder draft "" none)
printf '\nDoctor port: {port}\n' >> "$r/$SK/features/todos.md"
expect "leftover {port} placeholder" 1 '^RESULT: FAIL' "$r/$SK"

r=$(new_repo nocleanup draft "" none)
sed -e 's/^## Cleanup/## Teardown/' "$r/$SK/SKILL.md" > "$r/x" && mv "$r/x" "$r/$SK/SKILL.md"
expect "missing Cleanup section" 1 '^RESULT: FAIL' "$r/$SK"

# 템플릿 원본을 그대로 스킬로 쓰면 플레이스홀더로 실패해야 한다
r=$(new_repo rawtemplate draft "" none)
cp "$P/templates/verify-skill/SKILL.template.md" "$r/$SK/SKILL.md"
cp "$P/templates/verify-skill/features/README.template.md" "$r/$SK/features/README.md"
expect "raw template" 1 '^RESULT: FAIL' "$r/$SK"

expect "usage error" 2 '^usage:' "$TMP/does-not-exist"

echo "---"
echo "passed=$pass failed=$failn"
[ "$failn" -eq 0 ]
