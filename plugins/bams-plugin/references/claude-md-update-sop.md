# CLAUDE.md "현재 상태" 갱신 SOP (Manual)

> OQ6=(c) 결정 — 본 문서는 manual SOP. 자동 hook은 별도 plan에서 검토.

## 트리거 시점
- 파이프라인 `pipeline_end` emit 직후
- PR 머지 직후
- retro 완료 직후

## 절차
1. `.crew/board.md`에서 활성 plan / In Review / Done 추출
2. CLAUDE.md "## 현재 상태" 섹션 갱신:
   - Last updated 날짜 갱신
   - 진행 중 항목 갱신 / 완료 항목은 "최근 완료"로 이동
   - PR 번호 / 머지 commit 명시
3. 단일 commit: `docs(claude): {slug} 진행상황 반영`

## stale 감지
- `git log --since "1 month ago" --pretty=format:%s | grep -E "feat|fix" | wc -l > 5`이지만
  CLAUDE.md "Last updated"가 1 month 이상 → stale

## 향후 자동화 후보 (별도 plan)
- `.git/hooks/post-merge` 자동 갱신
- `.github/workflows/claude-md-sync.yml`
- 본 plan에서는 명세만, 실 hook은 차기 사이클
