# Pipeline Commands — Crew + gstack 통합 파이프라인

Crew 멀티에이전트 스킬과 gstack 브라우저/배포 스킬을 조합한 통합 워크플로우입니다.

## 사용 가능한 명령어

| 명령어 | 설명 | 단계 |
|--------|------|------|
| `/pipeline:project-init` | 신규 프로젝트 초기화 | 3단계 |
| `/pipeline:feature <기능>` | 풀 피처 개발 사이클 | 13단계 |
| `/pipeline:hotfix <버그>` | 버그 핫픽스 | 5단계 |
| `/pipeline:deep-review` | 다관점 심층 코드 리뷰 | 3단계 |
| `/pipeline:security` | 보안 감사 | 2~3단계 |
| `/pipeline:performance <url>` | 성능 측정/최적화 | 1~3단계 |
| `/pipeline:weekly` | 주간 루틴 (스프린트+회고) | 4단계 |

## 시스템 요구사항

- **Crew** (common-plugin): 항상 사용 가능
- **gstack** (gstack-plugin@ezar-plugins): 선택사항 — 미설치 시 crew 단계만 실행

## 진행 추적

각 파이프라인 실행 시 `.crew/artifacts/pipeline/` 에 진행 상태가 기록됩니다.
중단 후 재실행하면 마지막 미완료 단계부터 재개합니다.
