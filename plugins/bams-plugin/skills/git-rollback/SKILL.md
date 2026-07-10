---
name: git-rollback
version: 1.0.0
description: |
  커밋/파일 롤백 — dry-run 미리보기 기본, --yes 게이트 통과 시에만 실행. commit은 git revert, file은 git restore --source로 index 오염 없이 되돌린다.
  Use when asked to "rollback commit", "revert", "파일 되돌리기", "undo commit".
allowed-tools:
  - Bash
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# git-rollback — 커밋/파일 롤백

## 1. 목적

특정 커밋 또는 파일을 안전하게 되돌린다. 기본은 dry-run 미리보기이며 `--yes` 게이트를 통과해야 실제 변경이 적용된다. 히스토리 파괴 없이 revert/restore만 사용한다.

> 본 skill은 `git-ops-agent` 위임 시 Haiku 4.5로 실행된다. 판단이 필요한 롤백은 사용자가 main 모델 컨텍스트 유지를 권장한다.

## 2. 사용법

```
/git-rollback commit <sha> [--yes]
/git-rollback file <path> [--to <sha>] [--yes]
```

- `--yes` 없으면 dry-run(미리보기)만 출력하고 exit 1로 승인 대기
- `--to`: file 모드에서 복원 기준 커밋 (기본 `HEAD`)

## 3. 실행 로직

```bash
# NEVER: git reset --hard, git push --force, git push --force-with-lease (절대 금지 — 히스토리 파괴)
MODE="$1"; TARGET="$2"

case "$MODE" in
  commit)
    git rev-parse --verify "$TARGET^{commit}" >/dev/null 2>&1 || { echo "잘못된 sha: $TARGET"; exit 2; }
    echo "=== dry-run: revert 미리보기 ==="; git show --stat "$TARGET"
    if [ "$YES" != 1 ]; then echo "적용하려면 --yes 재실행"; exit 1; fi
    git revert "$TARGET" --no-edit || { echo "revert 충돌 — 수동 해결"; exit 2; } ;;
  file)
    SRC="${TO:-HEAD}"
    git rev-parse --verify "$SRC^{commit}" >/dev/null 2>&1 || { echo "잘못된 sha: $SRC"; exit 2; }
    echo "=== dry-run: $TARGET 를 $SRC 기준으로 복원 미리보기 ==="
    git diff "$SRC" -- "$TARGET" || { echo "대상 오류: $TARGET"; exit 2; }
    if [ "$YES" != 1 ]; then echo "적용하려면 --yes 재실행"; exit 1; fi
    git restore --source="$SRC" --worktree -- "$TARGET" || { echo "복원 실패"; exit 2; } ;;
  *) echo "사용법: commit <sha> | file <path>"; exit 2 ;;
esac
echo "롤백 완료"
```

## 4. 안전 가드

- `git reset --hard` / `git push --force` / `--force-with-lease` 는 코드 경로에 존재하지 않는다 (금지).
- 파괴적 되돌림 대신 `git revert`(새 커밋) 와 `git restore --source`(worktree만) 사용 → index/원격 히스토리 무손상.
- `--yes` 게이트 미통과 시 어떤 변경도 적용되지 않는다. careful hook과 이중 방어.

## 5. exit code

| code | 의미 |
|------|------|
| 0 | 롤백 성공 |
| 1 | dry-run 완료 (승인 대기 — --yes 재실행) |
| 2 | 대상 오류 / revert 충돌 |

관련: /ship (PR·land), /land-and-deploy (머지·배포), /careful (실행 직전 hook — git skill은 사전 게이트, 역할 분리는 PRD F-R7 참조)
