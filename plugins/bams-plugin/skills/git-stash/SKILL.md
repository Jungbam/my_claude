---
name: git-stash
version: 1.0.0
description: |
  작업 임시 저장 — push/pop/list는 직접 매핑, drop은 미리보기 + --yes 게이트로 안전 삭제. 미커밋 변경을 유실 없이 스택에 보관한다.
  Use when asked to "stash changes", "임시 저장", "pop stash", "stash drop".
allowed-tools:
  - Bash
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# git-stash — 작업 임시 저장

## 1. 목적

미커밋 변경을 stash 스택에 안전하게 넣고 뺀다. 파괴적 서브명령인 `drop`은 삭제 전 내용을 미리보기하고 `--yes` 게이트를 요구한다.

> 본 skill은 `git-ops-agent` 위임 시 Haiku 4.5로 실행되어 토큰을 절감한다.

## 2. 사용법

```
/git-stash push [-u] [-m <msg>]
/git-stash pop [<idx>]
/git-stash list
/git-stash drop <idx> --yes
```

## 3. 실행 로직

```bash
SUB="$1"; shift
case "$SUB" in
  push) git stash push "$@" && echo "stash 저장 완료" ;;
  pop)  IDX="${1:-0}"
        git stash list | grep -q "stash@{$IDX}" || { echo "stash 없음: $IDX"; exit 1; }
        git stash pop "stash@{$IDX}" || { echo "pop 충돌 — 수동 병합"; exit 2; } ;;
  list) git stash list; [ -z "$(git stash list)" ] && { echo "(비어있음)"; exit 1; }; exit 0 ;;
  drop)
        IDX="$1"
        git stash list | grep -q "stash@{$IDX}" || { echo "stash 없음: $IDX"; exit 1; }
        echo "=== 삭제 대상 미리보기 stash@{$IDX} ==="
        git stash show -p "stash@{$IDX}"
        # drop 은 파괴 명령 — --yes 필수
        if [ "$YES" != 1 ]; then echo "삭제하려면 --yes 재실행"; exit 1; fi
        git stash drop "stash@{$IDX}" && echo "stash@{$IDX} 삭제됨" ;;
  *) echo "사용법: push|pop|list|drop"; exit 2 ;;
esac
```

## 4. 안전 가드

- `drop` 은 파괴 명령 — 삭제 전 `git stash show -p` 로 반드시 내용 미리보기.
- `--yes` 미통과 시 exit 1, 어떤 stash도 삭제되지 않는다.
- `pop`/`drop` 은 존재하지 않는 인덱스면 즉시 exit 1 (오삭제 방지).

## 5. exit code

| code | 의미 |
|------|------|
| 0 | 성공 |
| 1 | stash 없음 / 게이트 거부 |
| 2 | 충돌 |

관련: /ship (PR·land), /land-and-deploy (머지·배포), /careful (실행 직전 hook — git skill은 사전 게이트, 역할 분리는 PRD F-R7 참조)
