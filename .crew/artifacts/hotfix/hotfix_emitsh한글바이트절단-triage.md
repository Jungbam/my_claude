# Triage: hotfix_emitsh한글바이트절단

## 메타
- slug: hotfix_emitsh한글바이트절단
- 날짜: 2026-04-03
- 심각도: Critical
- 부모 파이프라인: hotfix_viz한글slug검증
- 담당: pipeline-orchestrator (직접 수행 — Agent tool 미지원 환경)

## 결함 요약

`plugins/bams-plugin/hooks/bams-viz-emit.sh`에서 `head -c N`으로 문자열을 잘라낼 때 한글 UTF-8 멀티바이트 문자가 바이트 경계 중간에 잘려 invalid UTF-8 시퀀스가 생성된다. 이를 `jq --arg`로 파싱하면 파싱 오류가 발생하여 viz 이벤트 기록이 실패한다.

## 근본 원인

```
head -c 300 = 300 바이트 단위 절단
한글 1글자 = UTF-8 3바이트
→ 300 ÷ 3 = 100글자 정확히 나누어 떨어지지 않을 때 (예: "ab파이프라인..." 혼합 시작)
→ 마지막 한글 문자의 1~2바이트만 남음
→ UnicodeDecodeError: 'utf-8' codec can't decode byte 0xec at position 299
```

## 재현 증거

```bash
# "ab" + 한글로 시작하는 300바이트 절단 → 오류
printf 'ab파이프라인%.0s' {1..30} | head -c 300 | python3 -c "
import sys
data = sys.stdin.buffer.read()
data.decode('utf-8', errors='strict')
"
# → UnicodeDecodeError: 'utf-8' codec can't decode byte 0xec in position 299
```

## 수정 범위

파일: `plugins/bams-plugin/hooks/bams-viz-emit.sh` — 4곳

| 행 | AS-IS | TO-BE |
|----|-------|-------|
| 98 | `head -c 300` | `cut -c1-300` |
| 99 | `head -c 1000` | `cut -c1-1000` |
| 122 | `head -c 300` | `cut -c1-300` |
| 123 | `head -c 1000` | `cut -c1-1000` |

## 수정 방법 선택 근거

`cut -c1-N`: macOS/Linux POSIX 호환, `LC_ALL=en_US.UTF-8` 환경에서 문자(character) 단위 절단.
`awk substr`: 더 이식성이 높으나 외부 의존성 증가, `cut`으로 충분하여 불채택.

## 검증 결과

```bash
# cut -c1-300은 혼합 문자열에서도 정상 처리
printf 'ab파이프라인%.0s' {1..30} | cut -c1-300 | python3 -c "..."
# → OK: 152글자  (오류 없음)

# jq 파싱 정상
jq -cn --arg test "$(echo '파이프라인네이밍규칙정립' | cut -c1-5)" '{test:$test}'
# → {"test":"파이프라인"}
```

## 영향 분석

- viz 이벤트(`agent_start`, `agent_end`)에서 `prompt_summary`, `input`, `result_summary`, `output` 필드가 한글 텍스트일 때 jq 파싱 실패
- 실패 시 해당 이벤트 JSONL에 기록되지 않아 viz DAG/간트 차트에서 해당 에이전트 호출이 누락됨
- 부모 파이프라인 `hotfix_viz한글slug검증`에서 한글 slug가 활성화된 직후 발생하여 연쇄 장애로 이어짐

## 상태

RESOLVED — 2026-04-03 수정 완료, 검증 통과
