#!/usr/bin/env bash
# eval 자체 검증 (claude 호출 없음, 무료): 과제별 grade.sh 가 정답 적용본=1.0, 원본<=0.5(보통 0 근처), 테스트 변조=0 을 내는지,
# 과제 구조가 규칙에 맞는지, 러너 --dry-run 이 두 구성 모두 통과하는지 확인한다. 실패 시 exit 1.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; fail=0
TMP="$(mktemp -d "${TMPDIR:-/tmp}/eval-validate-XXXXXX")"; trap 'rm -rf "$TMP"' EXIT
printf '%-26s %-18s %8s %8s %8s  %s\n' task type original solution tamper structure
for tdir in "$HERE"/tasks/*/; do
  t="$(basename "$tdir")"; type=$(jq -r .type "$tdir/task.json")
  # 구조
  st=ok
  for f in prompt.md task.json grade.sh; do [ -e "$tdir/$f" ] || st="missing:$f"; done
  [ -d "$tdir/hidden" ] && [ -d "$tdir/solution" ] && [ -d "$tdir/repo" ] || st="missing-dir"
  jq -e '.command|test("^/bams:")' "$tdir/task.json" >/dev/null || st="bad-command"
  head -c1 "$tdir/prompt.md" | grep -q '/' && st="prompt-starts-with-slash"
  n=$(cd "$tdir/repo" && find . -type f -not -name package.json -not -path './node_modules/*' | wc -l | tr -d ' ')
  { [ "$n" -ge 3 ] && [ "$n" -le 8 ]; } || st="repo-files=$n(want 3-8)"
  [ -n "$(find "$tdir/repo" -iname '*hidden*' -o -iname '*solution*' | head -1)" ] && st="leak-in-repo"
  # 원본
  rm -rf "$TMP/w"; mkdir -p "$TMP/w"; cp -R "$tdir/repo/." "$TMP/w/"
  orig=$("$tdir/grade.sh" "$TMP/w" | jq -r .score)
  # 정답 적용본
  cp -R "$tdir/solution/." "$TMP/w/"
  sol=$("$tdir/grade.sh" "$TMP/w" | jq -r .score)
  # 변조(코드 과제만): 정답 적용본에서 기존 테스트 하나를 수정
  tam="n/a"
  tf=$(cd "$tdir/repo" && find . -name '*.test.ts' | head -1)
  if [ "${type%%-*}" != review ] && [ "$type" != plan ] && [ -n "$tf" ]; then
    echo "// tampered" >> "$TMP/w/$tf"; tam=$("$tdir/grade.sh" "$TMP/w" | jq -r .score)
  fi
  ok=1
  awk -v s="$sol" 'BEGIN{exit !(s>=0.9999)}' || ok=0
  awk -v o="$orig" 'BEGIN{exit !(o<=0.5)}' || ok=0
  { [ "$tam" = "n/a" ] || [ "$tam" = "0.0000" ] || [ "$tam" = "0" ]; } || ok=0
  [ "$st" = ok ] || ok=0
  [ "$ok" = 1 ] || fail=1
  printf '%-26s %-18s %8s %8s %8s  %s %s\n' "$t" "$type" "$orig" "$sol" "$tam" "$st" "$([ $ok = 1 ] && echo PASS || echo FAIL)"
done
for c in bams single; do
  if "$HERE/run.sh" --config $c --task all --dry-run >"$TMP/dry-$c.txt" 2>&1; then
    echo "dry-run $c: OK ($(grep -c '^---' "$TMP/dry-$c.txt") tasks)"
  else echo "dry-run $c: FAIL"; fail=1; fi
done
grep -q -- "--plugin-dir" "$TMP/dry-bams.txt" && ! grep -q -- "--plugin-dir" "$TMP/dry-single.txt" && grep -q 'enabledPlugins' "$TMP/dry-single.txt" \
  && echo "config diff: OK (bams=--plugin-dir, single=enabledPlugins false, no plugin-dir)" || { echo "config diff: FAIL"; fail=1; }
grep -q '/bams:' "$TMP/dry-bams.txt" && ! grep -q "'/bams:" "$TMP/dry-single.txt" && echo "prompt diff: OK" || { echo "prompt diff: FAIL"; fail=1; }
[ "$fail" = 0 ] && echo "ALL OK" || { echo "VALIDATION FAILED"; exit 1; }
