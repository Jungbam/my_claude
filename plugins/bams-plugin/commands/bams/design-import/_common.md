# Design Import: 공통 규칙

> design-import 파이프라인 전용 공통 규칙.
> 엔트리포인트(design-import.md)에서 모든 Phase 실행 전 Read.

## 0. 상위 공통 규칙 로드

`commands/bams/_shared_common.md` 를 Read하여
위임 원칙, viz emit 규칙, TaskDB 연동, WU 선택 규칙을 로드한다.

## 1. 인자 파싱 (POSIX 스타일 — OQ1=(a))

$ARGUMENTS 에서 다음 5종을 파싱한다:

| 인자 | 형식 | 설명 |
|------|------|------|
| `<가이드 경로>` | 위치 인자 1번 | 절대/상대 경로 또는 URL (단일 파일, 디렉터리, ZIP) |
| `--scenario s1\|s2\|s3` | 옵션 | 시나리오 선택 (미지정 → AskUserQuestion — OQ6=(a)) |
| `--target <경로 또는 URL>` | 옵션 | S1/S2: App Router 경로 / S3: localhost URL |
| `--dry-run` | 플래그 | 강제 dry-run 모드 (DRY_RUN=true) |
| `--no-dry-run` | 플래그 | dry-run 스킵 (DRY_RUN=false) |
| `--skip-verify` | 플래그 | Phase 2 verify 건너뜀 (내부 테스트용) |

파싱 결과를 다음 변수로 설정한다:
  GUIDE_PATH, SCENARIO, TARGET, DRY_RUN, SKIP_VERIFY

DRY_RUN 결정 순서:
  1. --dry-run 존재  → DRY_RUN=true
  2. --no-dry-run 존재 → DRY_RUN=false
  3. 둘 다 없음 → DRY_RUN=interactive (Phase 0-I 또는 P8에서 결정)

## 2. slug 생성 규칙

pipeline-slug 형식: `design-import_{한글요약}_{YYYYMMDD}`

예시:
- guide_path = "~/Downloads/dashboard-guide/" → `design-import_대시보드이식_20260624`
- guide_path = "design/mockup.html"          → `design-import_mockup이식_20260624`

slug 생성 후 `{slug}` 변수 전역 사용.

## 3. codex_available 사전 체크 (PR #10 hotfix 패턴 재사용)

```bash
codex_available() {
  command -v codex >/dev/null 2>&1 || return 1
  [ "$(jq -r '.auth_mode // ""' ~/.codex/auth.json 2>/dev/null)" = "apikey" ] || return 1
  return 0
}
```

S1/S2 시나리오 시: codex_available 실패 → OQ7=(b) 처리:
  1. 에러 메시지: "codex 미인증 — `codex login` 을 실행한 뒤 엔터를 눌러 재시도하거나 Ctrl+C 로 중단하세요"
  2. 30초 대기 후 재시도 (최대 3회)
  3. 3회 모두 실패 → pipeline_end status="failed" emit 후 종료

S3 시나리오는 codex 미사용 → 이 체크 skip.

## 4. 가이드 격리 함수 (F2 자동 격리 — OQ4=(a))

```bash
isolate_guide() {
  local src="$1"   # 원본 경로 (절대 경로로 정규화)
  local dest=".crew/artifacts/design/${slug}/guide-input"
  mkdir -p "$dest"

  if [ -f "$src" ]; then
    # 단일 파일
    if echo "$src" | grep -qiE '\.zip$'; then
      unzip -d "$dest" "$src"          # ZIP 압축 해제
    else
      cp "$src" "$dest/"
    fi
  elif [ -d "$src" ]; then
    cp -R "$src/." "$dest/"            # 디렉터리: 원본 구조 유지
  else
    echo "[ERROR] 경로를 찾을 수 없습니다: $src" >&2
    return 1
  fi
  echo "[OK] 가이드 격리 완료: $dest"
}
```

주의: mv 금지 — 원본 외부 파일은 건드리지 않는다 (SR-1).

## 5. 줄 수 체크 (best-practice §Preflight 6)

격리 완료 후 실행:

```bash
_TOTAL_LINES=$(find ".crew/artifacts/design/${slug}/guide-input" -type f | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
if [ "${_TOTAL_LINES:-0}" -gt 10000 ]; then
  echo "[WARN] 가이드 합계 ${_TOTAL_LINES}줄 > 10,000 — F1에 청킹 권고 (chunk_strategy: directory)"
fi
```

## 6. 시나리오 매핑 표

| 시나리오 | mode 값 | F3 실행 여부 | F8 실행 여부 | Phase E 동작 |
|---------|---------|------------|------------|-------------|
| S1 신규 페이지 이식 | `new_page` | skip | 단일 페이지면 skip | src/app/{target}/ 신규 디렉터리 생성 |
| S2 기존 페이지 교체 | `partial` | 필수 (opus) | 선택 | patch.diff 적용 + conflict-report 해소 |
| S3 충실도만 | `standalone` | skip | skip | 변경 없음, verdict.json만 |
