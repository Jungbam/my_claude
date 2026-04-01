---
pipeline: performance
started_at: {ISO_TIMESTAMP}
completed_at:
status: in_progress
url: {URL}
mode: {baseline/compare/trend}
previous_baseline: {PREVIOUS_FILE or null}
---

## Results

### Core Web Vitals

| 지표 | 값 | 등급 | 임계값 |
|------|-----|------|--------|
| LCP (Largest Contentful Paint) | {N}s | {Good/Needs Improvement/Poor} | Good < 2.5s |
| FID (First Input Delay) | {N}ms | {Good/Needs Improvement/Poor} | Good < 100ms |
| CLS (Cumulative Layout Shift) | {N} | {Good/Needs Improvement/Poor} | Good < 0.1 |
| FCP (First Contentful Paint) | {N}s | | |
| TTFB (Time to First Byte) | {N}ms | | |

### 리소스

| 지표 | 값 |
|------|-----|
| 총 요청 수 | {N} |
| 총 전송 크기 | {N}KB |
| JS 번들 크기 | {N}KB |
| CSS 크기 | {N}KB |
| 이미지 크기 | {N}KB |

## Comparison

| 지표 | 이전 | 현재 | 변화 | 판정 |
|------|------|------|------|------|
| LCP | {N}s | {N}s | {+/-N}s | regression/stable/improvement |
| FCP | {N}s | {N}s | {+/-N}s | |
| CLS | {N} | {N} | {+/-N} | |
| 번들 | {N}KB | {N}KB | {+/-N}KB | |

## Execution Log

- [{TIME}] 모드: {baseline/compare/trend}
- [{TIME}] 측정 완료: LCP {N}s, FCP {N}s, CLS {N}
- [{TIME}] 비교: {회귀 N개, 개선 N개, 안정 N개}
