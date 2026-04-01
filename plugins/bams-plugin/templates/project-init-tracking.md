---
pipeline: project-init
started_at: {ISO_TIMESTAMP}
completed_at:
status: in_progress
gstack: {true/false}
---

## Steps

| Step | 이름 | 상태 | 완료시각 | 비고 |
|------|------|------|----------|------|
| 1 | Crew 워크스페이스 | pending | | |
| 2 | 디자인 시스템 | pending | | |
| 3 | 배포 설정 | pending | | |

## 초기화 결과

### Crew 워크스페이스
- config.md: {created/already_exists}
- board.md: {created/already_exists}
- 기술스택: {DETECTED_STACK}
- 디렉토리 구조: {KEY_DIRS}

### 디자인 시스템
- DESIGN.md: {created/skipped/already_exists}
- 컬러 팔레트: {SUMMARY}
- 타이포그래피: {SUMMARY}

### 배포 설정
- 플랫폼: {DETECTED_PLATFORM or skipped}
- URL: {PRODUCTION_URL}
- 헬스체크: {ENDPOINT}

## Execution Log

- [{TIME}] Step 1: {crew:init 실행 결과 or 건너뜀}
- [{TIME}] Step 2: {design-consultation 결과 or 건너뜀}
- [{TIME}] Step 3: {setup-deploy 결과 or 건너뜀}
