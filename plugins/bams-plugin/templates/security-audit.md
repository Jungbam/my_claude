---
pipeline: security
started_at: {ISO_TIMESTAMP}
completed_at:
status: in_progress
mode: {daily/comprehensive}
gstack: {true/false}
previous_audit: {PREVIOUS_FILE or null}
---

## Steps

| Step | 이름 | 상태 | 완료시각 | 결과 |
|------|------|------|----------|------|
| 1 | Crew 시크릿 체크 | pending | | |
| 2 | gstack OWASP+STRIDE | pending | | |
| 3 | 심층 스캔 | pending | | |

## Findings

### Critical

| ID | 파일:라인 | CWE | 설명 | 수정안 |
|----|-----------|-----|------|--------|

### Major

| ID | 파일:라인 | CWE | 설명 | 수정안 |
|----|-----------|-----|------|--------|

### Minor

| ID | 파일:라인 | CWE | 설명 | 수정안 |
|----|-----------|-----|------|--------|

## 이전 대비 변화

| 지표 | 이전 | 현재 | 변화 |
|------|------|------|------|
| Critical | {N} | {N} | {+/-N} |
| Major | {N} | {N} | {+/-N} |
| 해결됨 | — | {N} | |
| 신규 | — | {N} | |
| 지속 | — | {N} | |

## 의존성 경고

| 패키지 | 현재 버전 | CVE | 심각도 | 권장 조치 |
|--------|-----------|-----|--------|-----------|

## Execution Log

- [{TIME}] Step 1: Crew verify — {PASS/WARN/FAIL}, 시크릿 {N}건
- [{TIME}] Step 2: CSO — Critical {N}, Major {N} (or skipped)
- [{TIME}] Step 3: 심층 — {결과} (or skipped)
