---
name: design-qa
version: 1.0.0
description: |
  브라우저 기반 정성 QA — 스크린샷 + spec 대조 + 10항 체크리스트 하이브리드 판정.
  visual-fidelity-verifier(정량 픽셀 diff)와 병존, 정성 semantic 판정 담당.
  Use when asked to "design qa", "디자인 정성 검증", "spec 대조", "구현 의도 검증".
allowed-tools:
  - Bash
  - Read
  - Grep
---
<!-- AUTO-GENERATED from SKILL.md.tmpl — do not edit directly -->
<!-- Regenerate: bun run gen:skill-docs -->

# design-qa — 브라우저 정성 QA

## 1. 목적

구현이 spec의 **의도**를 실제로 달성했는가를 판단하는 정성 semantic 검증. 브라우저에서
스크린샷을 촬영하고 구현 의도(spec)와 대조하여 10항을 하이브리드로 판정한다.

> `visual-fidelity-verifier`(정량 픽셀 diff + WCAG 명도)와 병존한다. 본 skill은
> "정보 계층·CTA 가시성·인터랙션 피드백" 같은 **semantic 판정**을 담당한다.

## 2. 사용법

```
/design-qa <url> [--spec <path>] [--viewport mobile|tablet|desktop|all]
```

- `<url>`: 검증 대상 페이지 URL (필수)
- `--spec`: 구현 의도 spec 경로. 생략 시 `.crew/artifacts/design/*-design-ui.md` 최신 자동 로드
- `--viewport`: `mobile`(375) / `tablet`(768) / `desktop`(1280) / `all`(기본, 3종 모두)

## 3. arg-parse 프리앰블

```bash
VIEWPORT=all; SPEC=""; POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --spec) SPEC="$2"; shift ;;
    --viewport) VIEWPORT="$2"; shift ;;
    --) shift; break ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *) POS+=("$1") ;;
  esac
  shift
done
URL="${POS[0]}"
if [ -z "$URL" ]; then
  echo "usage: /design-qa <url> [--spec <path>] [--viewport mobile|tablet|desktop|all]" >&2
  exit 2
fi
# spec 자동 로드
if [ -z "$SPEC" ]; then
  SPEC=$(ls -t .crew/artifacts/design/*-design-ui.md 2>/dev/null | head -1)
  [ -z "$SPEC" ] && echo "warn: spec 파일 없음 (--spec 명시 권장)" >&2
fi
```

## 4. 10항 하이브리드 체크리스트

**자동 판정 (7항)** — bams:browse 결과로 결정론적 판정:

| # | 항목 | 판정 방식 |
|---|------|----------|
| 1 | 정보 계층 | heading 순서 자동 스캔 (h1→h2→h3 위계 spec 일치) |
| 3 | 여백/간격 | spacing scale 8/16/24 준수 검증 |
| 6 | 다크모드 | bams:browse dark toggle 후 재촬영, 토큰 전환·대비 유지 |
| 7 | 반응형 | mobile/tablet/desktop 3 viewport 의도된 레이아웃 |
| 8 | 접근성 | axe-core 결과 (aria 라벨, focus visible) |
| 9 | 모션 | prefers-reduced-motion 존중 확인 |
| 10 | 텍스트 오버플로우 | 긴 콘텐츠 삽입 후 재촬영, 잘림 검출 |

**사용자 확인 (3항)** — 주관적·애매하여 사용자 판단 필요:

| # | 항목 | 확인 방식 |
|---|------|----------|
| 2 | CTA 가시성 | fold 위 배치 사용자 판단 |
| 4 | 컴포넌트 상태 | 로딩/에러/빈 상태 트리거 후 사용자 확인 |
| 5 | 인터랙션 | hover/focus/click 시각 피드백 사용자 확인 |

## 5. 실행 로직

```bash
# Step 1: spec 로드 → 검증 항목 매핑
[ -n "$SPEC" ] && [ -f "$SPEC" ] && echo "spec: $SPEC"

# Step 2: bams:browse로 초기 스크린샷 (viewport별)
_BROWSE_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/browse/SKILL.md" 2>/dev/null | head -1)
[ -z "$_BROWSE_SKILL" ] && _BROWSE_SKILL=$(find . -path "*/bams-plugin/skills/browse/SKILL.md" 2>/dev/null | head -1)
[ -z "$_BROWSE_SKILL" ] && { echo "bams:browse skill 미설치 — 촬영 불가" >&2; exit 2; }
# bams:browse 호출: viewport별 스크린샷 촬영 (mobile/tablet/desktop, dark toggle 포함)

# Step 3: 10항 순차 판정 (자동 7 + 사용자 3)
#  자동: heading/spacing/dark/responsive/a11y/motion/overflow 결정론적 검증
#  사용자: CTA/상태/인터랙션 → echo 안내 후 사용자 confirm/reject 수집
#          (skill 내 stdin 대화가 어려우므로 판정 대기 항목을 리포트에 CONDITIONAL로 기록)

# Step 4: 리포트 생성 (templates/design-qa-report.md 기반)
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
REPORT=".crew/artifacts/review/design-qa-$TIMESTAMP.md"
mkdir -p .crew/artifacts/review
# 템플릿 복사 + {url}/{spec_path}/{viewport}/판정 필드 치환 → $REPORT 저장
echo "리포트: $REPORT"
```

## 6. exit code

| code | 의미 |
|------|------|
| 0 | PASS — 10항 모두 자동 판정 PASS |
| 1 | CONDITIONAL — 사용자 확인 항목 다수 (판정 대기) |
| 2 | FAIL — 자동 판정 실패 또는 입력 오류 |

## 7. 관련

관련: visual-fidelity-verifier (정량 픽셀 diff + WCAG 명도),
     bams:browse (헤드리스 브라우저 — 본 skill의 촬영 도구),
     /careful (파괴 명령 hook — 본 skill은 read-only이므로 미필요)
