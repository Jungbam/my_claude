# 커서 파일 형식 설명

## 위치

`.doc-review-cursor` (프로젝트 루트)

## 형식

```
<full-commit-sha>
# Last reviewed: YYYY-MM-DD HH:MM:SS UTC
# Reviewed by: doc-drift skill
```

## 예시

```
a1b2c3d4e5f6789012345678901234567890abcd
# Last reviewed: 2026-04-03 10:30:00 UTC
# Reviewed by: doc-drift skill
```

## 동작 규칙

1. 커서 파일이 없으면 최초 실행으로 간주 — 60일 이내 가장 오래된 커밋부터 스캔
2. 커서 SHA가 유효하지 않으면 (force push 등) 최근 30일 커밋으로 fallback
3. 커서는 감사 완료 후 항상 업데이트 (drift 발견 여부와 무관)
4. drift 있는 경우: PR 브랜치에 포함하여 커밋
5. drift 없는 경우: 현재 브랜치에서 단독 커밋

## .gitignore 처리

`.doc-review-cursor`는 git 추적 파일이다 — .gitignore에 추가하지 않는다.
