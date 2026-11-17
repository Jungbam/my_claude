#!/usr/bin/env bash
# check-verify-skill.sh — 생성된 프로젝트 검증 스킬(.claude/skills/verify-<app>/)의 기계 검사.
#
# 정본 규칙: references/verification-skill-protocol.md §3·§5·§7.
# 생성 에이전트(/bams:init Step 11.5)는 이 검사를 통과해야만 `status: proven`을 남길 수 있고,
# /bams:verify Phase 0은 이 검사가 실패한 스킬을 draft로 취급한다.
#
# 검사 항목
#   1. 구조     SKILL.md frontmatter `name: verify-*`·`description:`,
#               H2 섹션 Launch / Doctor / Drive / Evidence / Cleanup, `status:` 줄, features/README.md
#   2. 플레이스홀더  SKILL.md + features/**/*.md 에 템플릿 `{…}` 잔존 0건
#               (HTML 주석, `${…}`·`%{…}`·`@{…}`, 공백으로 시작하는 `{ cmd; }`, 따옴표·`$`가 든 중괄호(JSON·awk),
#                `{a,b}`·`{1..3}` 확장은 제외)
#   3. proven   status: proven 이면
#               - proven_commit 이 `git cat-file -e <sha>^{commit}` 로 해석됨
#               - evidence 경로가 존재하는 디렉터리이고 크기 > 0 파일이 1개 이상
#               - proven_at(YYYY-MM-DD)·proven_feature 값 존재
#
# 사용: bash scripts/check-verify-skill.sh <skill-dir> [repo-root]
#   repo-root 생략 시 <skill-dir> 의 git toplevel. evidence·proven_commit 은 repo-root 기준.
# 출력 마지막 줄: `RESULT: proven` | `RESULT: draft` | `RESULT: FAIL (n)`
# Exit: 0 = 통과(proven 또는 구조가 온전한 draft), 1 = 검사 실패(→ draft로 취급), 2 = 사용법/환경 오류
set -u

if [ $# -lt 1 ] || [ ! -d "$1" ]; then
  echo "usage: check-verify-skill.sh <skill-dir> [repo-root]" >&2
  exit 2
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "SKIP: python3 없음" >&2
  exit 2
fi

SKILL_DIR="$(cd "$1" && pwd)"
if [ $# -ge 2 ]; then
  [ -d "$2" ] || { echo "repo-root 없음: $2" >&2; exit 2; }
  ROOT="$(cd "$2" && pwd)"
else
  ROOT="$(git -C "$SKILL_DIR" rev-parse --show-toplevel 2>/dev/null)" || ROOT=""
  [ -n "$ROOT" ] || { echo "git 리포 밖: repo-root 인자를 지정하세요" >&2; exit 2; }
fi

exec python3 -I - "$SKILL_DIR" "$ROOT" <<'PY'
import os, re, subprocess, sys

skill_dir, root = sys.argv[1], sys.argv[2]
fails = []


def fail(msg):
    fails.append(msg)
    print(f"FAIL: {msg}")


def rel(p):
    r = os.path.relpath(p, root)
    return p if r.startswith("..") else r


skill_md = os.path.join(skill_dir, "SKILL.md")
if not os.path.isfile(skill_md):
    print(f"FAIL: SKILL.md 없음: {skill_md}")
    print("RESULT: FAIL (1)")
    sys.exit(1)

with open(skill_md, encoding="utf-8") as f:
    text = f.read()

# ── 1. 구조 ──────────────────────────────────────────────────────
fm = re.match(r"^---\n(.*?)\n---\n", text, re.S)
if not fm:
    fail("SKILL.md frontmatter 없음")
else:
    if not re.search(r"^name:\s*verify-[a-z0-9][a-z0-9-]*\s*$", fm.group(1), re.M):
        fail("frontmatter `name: verify-<app>` 없음/형식 오류")
    if not re.search(r"^description:\s*\S", fm.group(1), re.M):
        fail("frontmatter `description:` 없음")

for sec in ("Launch", "Doctor", "Drive", "Evidence", "Cleanup"):
    if not re.search(rf"^##\s+{sec}\b", text, re.M):
        fail(f"필수 섹션 `## {sec}` 없음")

if not os.path.isfile(os.path.join(skill_dir, "features", "README.md")):
    fail("features/README.md 없음")


def field(name):
    m = re.search(rf"^{name}:[ \t]*([^\n#]*)", text, re.M)
    return None if m is None else m.group(1).strip()


status = field("status")
if status is None:
    fail("`status:` 줄 없음")
elif status not in ("draft", "proven"):
    fail(f"status 값 오류: {status!r} (draft|proven)")

# ── 2. 플레이스홀더 잔존 ─────────────────────────────────────────
targets = [skill_md]
fdir = os.path.join(skill_dir, "features")
for dp, _, fns in os.walk(fdir):
    targets += [os.path.join(dp, n) for n in sorted(fns) if n.endswith(".md")]

BRACE = re.compile(r"(?<![$%@\\])\{([^{}\n]+)\}")
EXPANSION = re.compile(r"^(?:[^\s,]*,[^\s]*|\w+\.\.\w+)$")
ph_total = 0
for path in targets:
    with open(path, encoding="utf-8") as f:
        body = f.read()
    # HTML 주석은 줄 수를 유지한 채 비운다
    body = re.sub(r"<!--.*?-->", lambda m: "\n" * m.group(0).count("\n"), body, flags=re.S)
    for ln, line in enumerate(body.splitlines(), 1):
        for m in BRACE.finditer(line):
            inner = m.group(1)
            # 셸 그룹 `{ cmd; }`·JS 객체 `{ a: 1 }` 는 공백으로 시작한다 — 템플릿 플레이스홀더는 그렇지 않다
            if inner[0].isspace() or any(c in inner for c in "\"'$") or EXPANSION.match(inner):
                continue
            ph_total += 1
            if ph_total <= 20:
                print(f"  placeholder {rel(path)}:{ln}: {m.group(0)}")
if ph_total:
    fail(f"템플릿 플레이스홀더 {ph_total}개 잔존")

# ── 3. proven 주장 검증 ──────────────────────────────────────────
if status == "proven":
    commit = field("proven_commit") or ""
    if not commit:
        fail("proven인데 proven_commit 비어 있음")
    elif not re.fullmatch(r"[0-9a-fA-F]{4,40}", commit):
        fail(f"proven_commit 형식 오류: {commit!r}")
    else:
        r = subprocess.run(["git", "-C", root, "cat-file", "-e", f"{commit}^{{commit}}"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if r.returncode != 0:
            fail(f"proven_commit {commit} 이 이 리포에서 커밋으로 해석되지 않음 (git cat-file -e)")

    evid = field("evidence") or ""
    if not evid:
        fail("proven인데 evidence 경로 비어 있음")
    else:
        ep = evid if os.path.isabs(evid) else os.path.join(root, evid)
        if not os.path.isdir(ep):
            fail(f"evidence 디렉터리 없음: {evid}")
        else:
            nonempty = [os.path.join(dp, n) for dp, _, fns in os.walk(ep) for n in fns
                        if os.path.getsize(os.path.join(dp, n)) > 0]
            if not nonempty:
                fail(f"evidence 디렉터리에 내용 있는 파일 0개: {evid}")
            else:
                print(f"  evidence: {evid} ({len(nonempty)} files)")

    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", field("proven_at") or ""):
        fail("proven인데 proven_at(YYYY-MM-DD) 없음/형식 오류")
    if not (field("proven_feature") or ""):
        fail("proven인데 proven_feature 비어 있음")

print(f"skill: {rel(skill_dir)}  status: {status}")
if fails:
    print(f"RESULT: FAIL ({len(fails)})")
    sys.exit(1)
print(f"RESULT: {status}")
sys.exit(0)
PY
