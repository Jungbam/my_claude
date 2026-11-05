#!/usr/bin/env python3
"""is_subseq.py <원본> <작업본>: 원본의 (공백 줄 제외, 우측 공백 무시) 모든 줄이 작업본에 같은 순서로 남아 있으면 exit 0.
추가(새 테스트·새 줄)는 허용, 기존 줄의 삭제·수정은 exit 1 (변조)."""
import sys
def lines(p):
    try:
        return [l.rstrip() for l in open(p, encoding="utf-8", errors="replace")]
    except FileNotFoundError:
        return None
o, n = lines(sys.argv[1]), lines(sys.argv[2])
if n is None:
    sys.exit(1)
it = iter(n)
sys.exit(0 if all(any(l == m for m in it) for l in o if l.strip()) else 1)
