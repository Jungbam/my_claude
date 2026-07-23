---
name: git-branch
version: 1.0.0
description: |
  브랜치 관리 — list/create/rename/delete. 컨벤션 정규식 검증, delete 기본 -d(merged만), --force=-D는 --yes 게이트 필수.
  Use when asked to "create branch", "브랜치 생성", "delete branch", "rename branch".
allowed-tools:
  - Bash
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# git-branch — 브랜치 관리

## 1. 목적

브랜치를 컨벤션에 맞게 생성/이름변경/삭제한다. 삭제 기본은 merged 브랜치만 허용하는 `-d`이며, 강제 삭제(`-D`)는 `--yes` 게이트를 통과해야 한다.

> 본 skill은 `git-ops-agent` 위임 시 Haiku 4.5로 실행되어 토큰을 절감한다.

## 2. 사용법

```
/git-branch list
/git-branch create <name>
/git-branch rename <old> <new>
/git-branch delete <name> [--force] [--yes]
```

## 3. 실행 로직

```bash
CONV='^bams/(feature|dev|hotfix|ship|plan|review|deploy|debug)_[A-Za-z0-9가-힣._-]+$'
# arg-parse: CLI 플래그를 셸 변수로 바인딩 (M-1)
POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) YES=1 ;;
    --force) FORCE=1 ;;
    --) shift; break ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) POS+=("$1") ;;
  esac
  shift
done
SUB="${POS[0]}"
case "$SUB" in
  list)   git branch -vv; exit 0 ;;
  create) NAME="${POS[1]}"
          echo "$NAME" | grep -qE "$CONV" || { echo "컨벤션 위반: $NAME — 사용자 승인 필요"; exit 1; }
          git branch -- "$NAME" && echo "생성: $NAME" ;;
  rename) OLD="${POS[1]}"; NEW="${POS[2]}"
          # 새 이름도 컨벤션 검증 (m-1, create와 가드 대칭)
          if ! echo "$NEW" | grep -qE "$CONV"; then
            echo "컨벤션 위반: $NEW (정규식: $CONV)" >&2
            [ "$YES" != 1 ] && exit 1
          fi
          git branch -m -- "$OLD" "$NEW" && echo "이름변경: $OLD → $NEW" ;;
  delete)
          NAME="${POS[1]}"
          if [ "$FORCE" = 1 ]; then
            # -D 는 파괴 명령 (미병합 커밋 유실) — --yes 필수
            if [ "$YES" != 1 ]; then echo "강제 삭제(-D)는 --yes 필수 — 미병합 커밋 유실 위험"; exit 1; fi
            # 파괴 명령 직전: careful hook 내재화 (M-2)
            DESTRUCTIVE_CMD="git branch -D $NAME"
            _CH=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/careful/bin/check-careful.sh" 2>/dev/null | head -1)
            [ -n "$_CH" ] && [ -x "$_CH" ] && CLAUDE_HOOK_TOOL_INPUT="{\"command\": \"$DESTRUCTIVE_CMD\"}" bash "$_CH" 2>&1 | head -5
            git branch -D -- "$NAME" && echo "강제 삭제: $NAME"
          else
            git branch -d -- "$NAME" || { echo "미병합 브랜치 — --force --yes 필요"; exit 1; }
            echo "삭제: $NAME"
          fi ;;
  *) echo "사용법: list|create|rename|delete"; exit 2 ;;
esac
```

## 4. 안전 가드

- `delete --force`(=`-D`)는 미병합 커밋을 유실시키는 파괴 명령 — `--yes` 게이트 필수.
- 기본 `-d`는 merged 브랜치만 삭제(git이 미병합 시 거부).
- `create`/`rename`은 컨벤션 정규식 위반 시 exit 1로 사용자 승인 요구 (가드 대칭).
- 모든 브랜치명은 `--` 구분자 뒤에 전달 — `-`로 시작하는 이름이 옵션으로 파싱되는 injection 차단.
- `delete --force`(-D) 실행 직전 careful hook을 skill 내부에서 직접 invoke — 세션 careful 활성 여부와 무관하게 경고 표시.

## 5. exit code

| code | 의미 |
|------|------|
| 0 | 성공 |
| 1 | 컨벤션 거부 / 게이트 거부 / 미병합 |
| 2 | 오류 |

관련: /ship (PR·land), /land-and-deploy (머지·배포), /careful (실행 직전 hook — git skill은 사전 게이트, 역할 분리는 PRD F-R7 참조)
