---
last_updated: {ISO_TIMESTAMP}
total: 0
---

# Gotchas

## ⚠ 반드시 확인 (Critical)

(아직 없음)

## 🔧 환경/설정 (Environment)

(아직 없음)

## 📦 의존성 (Dependencies)

(아직 없음)

## 🧩 패턴/컨벤션 (Patterns)

(아직 없음)

## 📋 이력

| ID | 추가일 | 출처 | 카테고리 | 상태 |
|----|--------|------|----------|------|

## 🔒 git 조작 정책

- **git 조작은 git-* skill 경유**: `git-sync/rollback/stash/branch`로 절차 캡슐화. 파괴 명령(`reset --hard`, `push --force`, `branch -D`, `stash drop`) 직접 실행 금지 — 각 skill의 `--yes` 게이트 통해서만.
- **토큰 절감 위임 경로**: git 조작을 Agent tool로 위임 시 `git-ops-agent`(haiku 4.5) 사용 — main 모델(opus/sonnet) 대비 실질 3배 절감. 사용자 직접 호출은 main 모델 컨텍스트 실행.

## 🛡 CLAUDE.md 편집 정책

- **[G-CLAUDE-HOOK]** CLAUDE.md Edit 시도 시 `hooks/claude-md-guard.sh`가 자동 차단 (exit 2 + deny JSON). 편집이 정말 필요하면 사용자 명시 요청 후 `CLAUDE_MD_EDIT_ALLOWED=1` env 세팅. 대체 경로: `.crew/board.md` / `.crew/history.md` / `.crew/artifacts/`.
