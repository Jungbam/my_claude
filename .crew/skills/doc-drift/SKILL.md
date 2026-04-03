---
name: doc-drift
description: >
  git log 기반 커서 방식으로 마지막 검토 이후 변경사항을 스캔하여 문서 drift를
  자동 감지한다. CLAUDE.md, README.md, .crew/config.md, plugins/bams-plugin/SKILL.md를
  대상으로 Feature/Breaking/Structural 변경을 분류하고, drift 발견 시 브랜치 + 최소 편집 + PR을 생성한다.
  /bams:weekly 루틴에 통합되어 주기적으로 실행된다.
---

# doc-drift — 문서 Drift 자동 감지

코드 변경과 문서의 정합성을 자동으로 유지한다. drift 감지 시 PR을 자동 생성한다.

참조: reference/paperclip/.agents/skills/doc-maintenance/SKILL.md

## 감시 대상 문서

| 문서 | 경로 | 감시 이유 |
|------|------|-----------|
| CLAUDE.md | `CLAUDE.md` | 커맨드, 프로젝트 구조, 컨벤션 변경 |
| README.md | `README.md` | 기능 목록, 설치 방법, 사용법 변경 |
| config.md | `.crew/config.md` | 아키텍처, 의존성, 배포 상태 변경 |
| bams SKILL | `plugins/bams-plugin/SKILL.md` | 스킬 명령어, 파이프라인 변경 |

**범위 외:** `.crew/artifacts/`, `browse/dist/`, 테스트 파일, `.crew/memory/`

## Step 1 — 커서 기반 변경 감지

마지막 검토 커밋 이후의 커밋을 조회한다.

```bash
CURSOR_FILE=".doc-review-cursor"
if [ -f "$CURSOR_FILE" ]; then
  LAST_SHA=$(head -1 "$CURSOR_FILE")
  echo "커서 발견: $LAST_SHA"
else
  # 최초 실행: 60일 이내 가장 오래된 커밋부터
  LAST_SHA=$(git log --format="%H" --after="60 days ago" --reverse | head -1)
  echo "최초 실행 — 60일 이내 커밋 스캔: $LAST_SHA"
fi

# 변경된 커밋 목록 조회
git log "${LAST_SHA}..HEAD" --oneline --no-merges 2>/dev/null || echo "변경 없음 (최신 상태)"
```

## Step 2 — 변경 분류

커밋 메시지와 변경 파일을 스캔하여 Feature/Breaking/Structural로 분류한다.

```bash
CURSOR_FILE=".doc-review-cursor"
LAST_SHA=$([ -f "$CURSOR_FILE" ] && head -1 "$CURSOR_FILE" || git log --format="%H" --after="60 days ago" --reverse | head -1)

# 변경된 파일 목록
git log "${LAST_SHA}..HEAD" --oneline --no-merges
echo "---"
git diff "${LAST_SHA}..HEAD" --name-only 2>/dev/null | head -50
```

변경 분류 규칙:

| 커밋 패턴 | 분류 | 문서 업데이트 필요? |
|-----------|------|---------------------|
| `feat:`, `add`, `implement`, `support` | Feature | Yes (사용자 기능이면) |
| `remove`, `drop`, `breaking`, `!:` | Breaking | Yes |
| 새 디렉터리/설정 파일 추가 | Structural | Maybe |
| `fix:`, `bugfix` | Fix | No (동작 설명 변경 아니면) |
| `refactor:`, `chore:`, `ci:`, `test:` | Maintenance | No |
| `docs:` | Doc change | No (이미 처리됨) |

**Feature/Breaking/Structural 변경이 없으면** Step 7로 건너뛰어 커서만 업데이트한다.

## Step 3 — 변경 요약 작성

다음 형식으로 변경 요약을 작성한다:

```
마지막 검토 이후 변경 요약 (<sha>, <date>):
- FEATURE: [기능 설명]
- BREAKING: [제거/변경 설명]
- STRUCTURAL: [구조 변경 설명]
```

변경이 없으면 "변경 없음" 메시지와 함께 Step 7로 이동한다.

## Step 4 — 각 감시 문서 감사

각 감시 대상 문서를 읽고 변경 요약과 대조하여 drift를 확인한다.

```bash
# 각 문서 내용 확인
cat CLAUDE.md 2>/dev/null
echo "---"
cat README.md 2>/dev/null | head -100
echo "---"
cat .crew/config.md 2>/dev/null
echo "---"
cat plugins/bams-plugin/SKILL.md 2>/dev/null | head -100
```

감사 체크포인트:
1. **False negative**: 코드에 추가된 기능이 문서에 없는 경우
2. **False positive**: 문서에 "예정"/"roadmap"으로 표시된 항목이 이미 구현된 경우
3. **커맨드 정확성**: CLAUDE.md의 `bun run *` 커맨드가 실제 package.json과 일치하는지
4. **아키텍처 정확성**: config.md의 "DB/MQ: 없음" 등이 실제 코드와 일치하는지

**Drift가 없으면** Step 7로 건너뛴다.

## Step 5 — 브랜치 생성

drift가 감지된 경우 수정용 브랜치를 생성한다.

```bash
BRANCH="docs/drift-fix-$(date +%Y%m%d)"
git checkout -b "$BRANCH"
echo "브랜치 생성: $BRANCH"
```

## Step 6 — 최소 편집 수행

**최소 편집 원칙 (반드시 준수):**
- 팩트 수정만 — 스타일/구조 변경 없음
- 기존 어조와 형식 유지
- 불필요한 섹션 추가 없음
- 로드맵 항목에서 출시된 기능만 이동

Edit 도구로 각 문서의 drift 부분만 최소 수정한다.

수정 완료 후 커밋 및 PR 생성:

```bash
BRANCH="docs/drift-fix-$(date +%Y%m%d)"
git add CLAUDE.md README.md .crew/config.md plugins/bams-plugin/SKILL.md .doc-review-cursor 2>/dev/null
git commit -m "docs: fix documentation drift detected since last review

- [수정 항목 목록]

Co-Authored-By: doc-drift skill <noreply@bams-plugin>"

git push -u origin "$BRANCH"

gh pr create \
  --title "docs: periodic documentation drift fix $(date +%Y-%m-%d)" \
  --body "$(cat <<'EOF'
## Summary
자동화된 문서 drift 감지 및 수정 패스. 마지막 검토 이후의 drift를 수정한다.

### 변경 항목
- [수정 항목]

### 코드 변경 요약 (drift 유발)
- [관련 코드 변경]

## 검토 참고사항
- 팩트 정확성 수정만 포함 — 스타일/미용 변경 없음
- 기존 어조와 구조 유지
- 대규모 문서 추가(새 섹션 등)는 별도 이슈로 기록

🤖 doc-drift skill (bams-plugin)에 의해 자동 생성
EOF
)"
```

## Step 7 — 커서 업데이트

감사 완료(편집 여부와 무관하게) 후 커서를 현재 HEAD로 업데이트한다.

```bash
echo "$(git rev-parse HEAD)
# Last reviewed: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# Reviewed by: doc-drift skill" > .doc-review-cursor

# drift 없는 경우: 커서 파일만 커밋
if git status --porcelain | grep -q "\.doc-review-cursor"; then
  git add .doc-review-cursor
  git commit -m "docs: update doc-review cursor (no drift detected)"
fi
```

## Step 8 — 완료 보고

```
=== doc-drift 완료 ===
스캔한 커밋 수: N
발견한 Notable 변경: N건
문서 편집: N건 (파일명)
PR: [URL 또는 "생성 없음 (drift 없음)"]
후속 항목: [대규모 문서 작업이 필요한 경우]
```

