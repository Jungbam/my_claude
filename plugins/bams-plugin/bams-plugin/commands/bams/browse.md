---
description: 인터랙티브 헤드리스 브라우저 — 페이지 탐색, 스크린샷, 폼 테스트
argument-hint: [URL]
---

# Bams Browse

bams-plugin 스킬을 실행합니다. 아래 순서를 따르세요:

## 1. 스킬 파일 찾기

```bash
_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/browse/SKILL.md" 2>/dev/null | head -1)
echo "SKILL: $_SKILL"
```

스킬 파일을 찾지 못한 경우, gstack-plugin의 browse 스킬을 대체로 검색합니다:

```bash
_SKILL=$(find ~/.claude/plugins/cache -path "*/gstack-plugin/*/skills/browse/SKILL.md" 2>/dev/null | head -1)
echo "FALLBACK SKILL: $_SKILL"
```

그래도 찾지 못하면 사용자에게 안내:
- "browse 스킬을 찾을 수 없습니다. bams-plugin 또는 gstack-plugin이 설치되어 있는지 확인하세요."
- 여기서 중단.

## 2. 스킬 실행

Read 도구로 `$_SKILL` 파일을 읽고, 그 안의 모든 지시사항을 따르세요.
Preamble bash 블록이 있으면 먼저 실행하세요.

URL이 $ARGUMENTS로 제공되었으면 해당 URL로 시작합니다.
