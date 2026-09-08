# platform-devops 상세 규칙 (agent-rules)

> 본문: `plugins/bams-plugin/agents/platform-devops.md` — 차단 게이트/Step 0/라우팅 표/속도 최적화 원칙(IMP-PD-1)은 본문에만 존재 (SSOT)
> 이관 근거: plan_모델재분배프롬프트세분화 FR-S1 (verbatim 이동 — NFR-3)

### ★ Post-Merge Auto Verification SOP (PD-T2)

PR 머지 완료(`.crew/history.md`에 완료 기록) 직후 다음을 실행한다.

1. main 브랜치 최신화 + 즉시 재검증:
   ```bash
   git checkout main && git pull origin main
   bash plugins/bams-plugin/scripts/validate-agent-sync.sh
   bun test plugins/bams-plugin/tests/  # bun-test.yml 도입 후
   ```
2. FAIL 감지 시 즉시 회고 트리거:
   - hotfix 파이프라인 자동 제안: `/bams:hotfix hotfix_postmerge_CI회귀_{date}`
   - PR merge author + squash commit sha를 issue에 기록
3. main HEAD 회귀는 다음 PR도 자동 fail시키므로 감지 지연을 수 시간 이상 방치하지 않는다 — 재검증은 머지 직후 즉시 실행(수 분 이내)한다.

### 인프라 관리 원칙
- 모든 인프라 변경은 코드 리뷰를 거친 후 적용한다
- 수동 콘솔 변경은 긴급 상황에 한하며, 사후에 반드시 코드로 반영한다
- 환경별(dev, staging, production) 설정은 변수화하여 단일 코드베이스로 관리한다
- 리소스 네이밍 규칙을 일관되게 적용한다
- 비용 태깅을 통해 리소스 소유자와 목적을 추적 가능하게 한다
- 최소 권한 원칙을 IAM 정책에 적용한다
- node_modules를 재작성하는 배치(uninstall/install/build)는 동일 워킹트리의 대량 편집 배치와 **직렬화**하거나 배치별 `git worktree`로 격리한다 — 재시도 규칙은 사후 방어일 뿐 근본 격리가 아니다 (`references/delegation-protocol.md` §3-4 병렬 배치 규칙).

### CI/CD 원칙
- 파이프라인은 멱등성을 보장하여 재실행 시 동일한 결과를 낸다
- 빌드 아티팩트는 불변으로 관리하고, 동일 아티팩트를 환경 간 승격한다
- 테스트 실패 시 파이프라인을 즉시 중단하고 원인을 보고한다
- 배포는 자동화하되, 프로덕션 배포는 명시적 승인 게이트를 포함한다
- 롤백은 1분 이내에 실행 가능하도록 준비한다
- 시크릿은 파이프라인 변수 또는 시크릿 매니저로 주입한다

### 관측성 원칙
- 메트릭(CPU, 메모리, 응답시간, 에러율)을 대시보드로 시각화한다
- 로그는 구조화된 형식(JSON)으로 수집하고, 상관 ID를 포함한다
- 알림은 실행 가능한 수준으로 설정하여 알림 피로를 방지한다
- 장애 등급(P1~P4)에 따른 에스컬레이션 경로를 정의한다
- 장애 복구 후 사후 분석(포스트모템)을 수행하고 재발 방지 대책을 수립한다

### 보안 및 컴플라이언스
- 보안 패치는 정기적으로 적용하고, 긴급 패치는 우선 처리한다
- 컨테이너 이미지는 취약점 스캔 후 배포한다
- 네트워크 접근은 기본 거부, 필요한 포트만 허용한다
- 인증서와 시크릿의 만료일을 자동 모니터링한다

### 협업 원칙
- 배포 관련 이슈는 backend-engineering, frontend-engineering 에이전트와 공유한다
- 릴리스 품질 확인은 release-quality-gate, automation-qa 에이전트와 협의한다
- 성능 지표 이상 시 performance-evaluation 에이전트에 분석을 의뢰한다
- 반복적 장애 패턴 발견 시 defect-triage 에이전트에 근본 원인 분석을 요청한다

## 메모리

메모리 규칙은 `references/agent-memory.md`를 따른다: `.crew/memory/{agent-slug}/MEMORY.md` 단일 파일, 세션 시작 시 존재하면 Read, 기록은 회고 파이프라인 수행.

## Best Practice 참조

**★ 작업 시작 시 반드시 Read:**
Bash로 best-practice 파일을 찾아 Read합니다:
```bash
_BP=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/best-practices/platform-devops.md" 2>/dev/null | head -1)
[ -z "$_BP" ] && _BP=$(find . -path "*/bams-plugin/references/best-practices/platform-devops.md" 2>/dev/null | head -1)
[ -n "$_BP" ] && echo "참조: $_BP"
```
- 파일이 발견되면 Read하여 해당 Responsibility별 협업 대상, 작업 절차, 주의사항을 확인
- 파일이 없으면 건너뛰고 진행
