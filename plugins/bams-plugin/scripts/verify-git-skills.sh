#!/usr/bin/env bash
# verify-git-skills.sh — git 관리 skill 4종의 arg-parse/게이트 로직 단위 검증 (m-5)
#
# deep-review M-1(플래그 미바인딩) 회귀 방지용. 각 SKILL.md.tmpl에서 실제 실행 로직을
# 발췌하여 임시 git repo 위에서 실행하고 결과 변수/exit code를 단언한다.
# CI 편입 대상.
#
# 사용: bash scripts/verify-git-skills.sh
# exit 0 = 전부 PASS, exit 1 = 하나라도 FAIL

set -uo pipefail

# skills 디렉토리 위치 (스크립트 기준 상대)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$SCRIPT_DIR/../skills"

PASS=0
FAIL=0

check() {
  # $1 = 설명, $2 = 실제, $3 = 기대
  if [ "$2" = "$3" ]; then
    printf 'PASS | %-55s | got=%s\n' "$1" "$2"
    PASS=$((PASS + 1))
  else
    printf 'FAIL | %-55s | got=[%s] expected=[%s]\n' "$1" "$2" "$3"
    FAIL=$((FAIL + 1))
  fi
}

# tmpl에서 arg-parse 프리앰블(POS=() ... done)만 발췌
extract_argparse() {
  awk '/^POS=\(\)$/{f=1} f{print} f&&/^done$/{exit}' "$SKILLS_DIR/$1/SKILL.md.tmpl"
}

# tmpl에서 첫 번째 ```bash 실행 로직 블록 전체 발췌
extract_block() {
  awk '/^```bash$/{f++; if(f==1){next}} f==1&&/^```$/{exit} f==1{print}' "$SKILLS_DIR/$1/SKILL.md.tmpl"
}

# arg-parse만 실행하고 결과 변수를 key=val 라인으로 출력 (서브셸)
run_argparse() {
  local skill="$1"; shift
  local block; block="$(extract_argparse "$skill")"
  (
    eval "$block"
    echo "YES=${YES:-}"
    echo "FORCE=${FORCE:-}"
    echo "BASE=${BASE:-}"
    echo "STRATEGY=${STRATEGY:-}"
    echo "TO=${TO:-}"
    echo "POS0=${POS[0]:-}"
    echo "POS1=${POS[1]:-}"
    echo "POS2=${POS[2]:-}"
  ) 2>/dev/null
}

# arg-parse 실행 후 exit code만 반환 (unknown flag 등)
argparse_exit() {
  local skill="$1"; shift
  local block; block="$(extract_argparse "$skill")"
  ( eval "$block" ) >/dev/null 2>&1
  echo $?
}

getval() { echo "$1" | grep "^$2=" | head -1 | cut -d= -f2-; }

# ── 임시 git repo ─────────────────────────────────────────────
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
git init -q
git config user.email test@test.local
git config user.name test
echo "v1" > f.txt
git add f.txt
git commit -qm "c1"
SHA="$(git rev-parse HEAD)"
ORIG_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "== git-sync arg-parse =="
R="$(run_argparse git-sync --base develop --strategy merge)"
check "git-sync --base develop → BASE=develop" "$(getval "$R" BASE)" "develop"
check "git-sync --strategy merge → STRATEGY=merge" "$(getval "$R" STRATEGY)" "merge"
check "git-sync unknown flag → exit 2" "$(argparse_exit git-sync --bogus)" "2"

echo "== git-rollback arg-parse =="
R="$(run_argparse git-rollback commit "$SHA" --yes)"
check "git-rollback --yes → YES=1" "$(getval "$R" YES)" "1"
check "git-rollback POS0=commit" "$(getval "$R" POS0)" "commit"
check "git-rollback POS1=<sha>" "$(getval "$R" POS1)" "$SHA"
R="$(run_argparse git-rollback file f.txt --to "$SHA")"
check "git-rollback --to <sha> → TO=<sha>" "$(getval "$R" TO)" "$SHA"
check "git-rollback unknown flag → exit 2" "$(argparse_exit git-rollback --bogus)" "2"

echo "== git-stash arg-parse =="
R="$(run_argparse git-stash push -u -m msg)"
check "git-stash push POS0=push" "$(getval "$R" POS0)" "push"
check "git-stash unknown flag → exit 2" "$(argparse_exit git-stash --bogus)" "2"

echo "== git-branch arg-parse =="
R="$(run_argparse git-branch delete bams/hotfix_x --force --yes)"
check "git-branch --force → FORCE=1" "$(getval "$R" FORCE)" "1"
check "git-branch --yes → YES=1" "$(getval "$R" YES)" "1"
check "git-branch POS0=delete" "$(getval "$R" POS0)" "delete"
check "git-branch POS1=bams/hotfix_x" "$(getval "$R" POS1)" "bams/hotfix_x"
check "git-branch unknown flag → exit 2" "$(argparse_exit git-branch --bogus)" "2"

echo "== git-rollback 게이트 (dry-run) =="
# --yes 없이 유효 sha → dry-run → exit 1
RB="$(extract_block git-rollback)"
( set -- commit "$SHA"; eval "$RB" ) >/dev/null 2>&1
check "rollback commit <sha> (--yes 없음) → exit 1(dry-run)" "$?" "1"
# 잘못된 sha → exit 2
( set -- commit deadbeefdeadbeef; eval "$RB" ) >/dev/null 2>&1
check "rollback commit <bad-sha> → exit 2" "$?" "2"

echo "== git-branch 게이트 (강제삭제) =="
git checkout -q -b bams/hotfix_unmerged
echo "v2" > f.txt; git commit -qam "c2"
git checkout -q "$ORIG_BRANCH"
BB="$(extract_block git-branch)"
# --force 있으나 --yes 없음 → exit 1
( set -- delete bams/hotfix_unmerged --force; FORCE=1; eval "$BB" ) >/dev/null 2>&1
check "branch delete --force (--yes 없음) → exit 1" "$?" "1"

echo ""
echo "════════════════════════════════════════════"
echo "RESULT: PASS=$PASS FAIL=$FAIL"
echo "════════════════════════════════════════════"
[ "$FAIL" -eq 0 ]
