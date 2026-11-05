#!/usr/bin/env python3
"""리뷰/계획 과제 채점: grade_text.py <task_dir> <work_dir>
hidden/answer.json 기준으로 채점. 입력 = 최종 메시지(env EVAL_FINAL_MESSAGE_FILE) + 산출물 파일(REVIEW.md / PLAN.md)
+ 작업 디렉터리에서 원본 repo 대비 새로 생기거나 바뀐 .md 파일 전부(.crew/config.md 제외). stdout: JSON 한 줄.
mode=review : defects 재현율(블록 단위로 file 정규식 + 키워드 동시 매칭) - decoy 오탐 감점(0.1/건)
mode=plan   : rubric 가중 합산 (any: 정규식 중 하나 매칭 / count_regex+min: 매칭 줄 수)
"""
import json, os, re, sys

task, work = sys.argv[1], sys.argv[2]
tid = os.path.basename(os.path.abspath(task))
ans = json.load(open(os.path.join(task, "hidden", "answer.json"), encoding="utf-8"))
path = os.path.join(work, ans["file"])

def out(score, detail, **kw):
    print(json.dumps({"task": tid, "score": round(max(0.0, min(1.0, score)), 4),
                      "tampered": False, "detail": detail, **kw}, ensure_ascii=False))
    sys.exit(0)

sources, parts = [], []
def add(label, p):
    try:
        t = open(p, encoding="utf-8", errors="replace").read()
    except OSError:
        return
    if t.strip():
        sources.append(label); parts.append(t)

fm = os.environ.get("EVAL_FINAL_MESSAGE_FILE")
if fm and os.path.isfile(fm):
    add("final_message", fm)
if os.path.isfile(path):
    add(ans["file"], path)
for root, dirs, files in os.walk(work):
    dirs[:] = [d for d in dirs if d not in (".git", "node_modules")]
    for f in files:
        if not f.lower().endswith(".md"):
            continue
        full = os.path.join(root, f)
        rel = os.path.relpath(full, work)
        if rel == ans["file"] or rel == os.path.join(".crew", "config.md"):
            continue
        orig = os.path.join(task, "repo", rel)
        try:
            same = os.path.isfile(orig) and open(orig, "rb").read() == open(full, "rb").read()
        except OSError:
            same = False
        if not same:
            add(rel, full)
if not parts:
    out(0.0, f"no output (no final message, no {ans['file']}, no new .md)")
text = "\n\n".join(parts)
if len(text.split()) < ans.get("min_words", 30):
    out(0.0, "too short", sources=sources)

def rx(p, s):
    return re.search(p, s, re.I | re.M) is not None

if ans["mode"] == "review":
    blocks = [b for b in re.split(r"\n\s*\n|\n(?=\s*(?:[-*]|\d+[.)])\s)|\n(?=#+ )|\n(?=\s*\|)", text) if b.strip()]
    found, missed = [], []
    for d in ans["defects"]:
        hit = any(rx(d["file"], b) and any(rx(k, b) for k in d["any"]) for b in blocks)
        (found if hit else missed).append(d["id"])
    tw = sum(d.get("weight", 1) for d in ans["defects"])
    fw = sum(d.get("weight", 1) for d in ans["defects"] if d["id"] in found)
    recall = fw / tw
    neg = ans.get("negative", r"bug|wrong|incorrect|vulnerab|issue|problem|should|must|fix|버그|문제|오류|취약")
    ok = ans.get("negated", r"\bfine\b|\bok\b|correct|no issue|not a (bug|problem)|문제 없|이상 없|정상|괜찮")
    fp = []
    for c in ans.get("decoys", []):
        if any(rx(c["file"], b) and any(rx(k, b) for k in c["any"]) and rx(neg, b) and not rx(ok, b) for b in blocks):
            fp.append(c["id"])
    out(recall - 0.1 * len(fp), f"found {len(found)}/{len(ans['defects'])} missed={missed} false_pos={fp}",
        found=found, false_pos=fp, sources=sources)

if ans["mode"] == "plan":
    got, miss, tw, fw = [], [], 0, 0
    for r in ans["rubric"]:
        w = r.get("weight", 1); tw += w
        if "count_regex" in r:
            ok_ = len(re.findall(r["count_regex"], text, re.I | re.M)) >= r["min"]
        else:
            ok_ = any(rx(p, text) for p in r["any"])
        if ok_: fw += w; got.append(r["id"])
        else: miss.append(r["id"])
    out(fw / tw, f"rubric {len(got)}/{len(got)+len(miss)} missed={miss}", met=got, sources=sources)

out(0.0, "unknown mode")
