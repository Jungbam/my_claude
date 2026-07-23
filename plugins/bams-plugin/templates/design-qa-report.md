# Design QA Report — {timestamp}

- **URL**: {url}
- **Spec**: {spec_path}
- **Viewport**: {viewport}
- **실행자**: /design-qa (하이브리드 판정)
- **관련**: visual-fidelity-verifier (정량 픽셀 diff와 상호 보완)

## 판정 요약

| # | 항목 | 방식 | 판정 | 근거 |
|---|------|------|------|------|
| 1 | 정보 계층 (heading 순서) | 자동 | PASS/FAIL | {heading_check} |
| 2 | CTA 가시성 (fold 위 배치) | 사용자 | PASS/CONDITIONAL/FAIL | {user_input} |
| 3 | 여백/간격 (8/16/24 시스템) | 자동 | PASS/FAIL | {spacing_check} |
| 4 | 컴포넌트 상태 (로딩/에러/빈) | 사용자 | PASS/CONDITIONAL/FAIL | {user_input} |
| 5 | 인터랙션 (hover/focus/click) | 사용자 | PASS/CONDITIONAL/FAIL | {user_input} |
| 6 | 다크모드 (토큰 자동 전환) | 자동 | PASS/FAIL | {dark_toggle_diff} |
| 7 | 반응형 (mobile/tablet/desktop) | 자동 | PASS/FAIL | {responsive_check} |
| 8 | 접근성 (axe-core) | 자동 | PASS/FAIL | {axe_result} |
| 9 | 모션 (prefers-reduced-motion) | 자동 | PASS/FAIL | {motion_check} |
| 10 | 텍스트 오버플로우 (긴 콘텐츠) | 자동 | PASS/FAIL | {overflow_check} |

**종합 판정**: PASS / CONDITIONAL / FAIL

## 스크린샷

| Viewport | 초기 상태 | 다크모드 | 오버플로우 |
|----------|-----------|----------|-----------|
| mobile (375px) | {path} | {path} | {path} |
| tablet (768px) | {path} | {path} | {path} |
| desktop (1280px) | {path} | {path} | {path} |

## 개선 제안 (FAIL/CONDITIONAL 항목만)

- **[#N 항목명]** {이슈 설명} → {수정 제안}
- ...

## 실행 컨텍스트

- 실행 시각: {timestamp}
- 소요 시간: {duration_s}s
- 사용자 확인 항목: {user_check_count}/3
- Spec 로드 성공: {spec_loaded}
