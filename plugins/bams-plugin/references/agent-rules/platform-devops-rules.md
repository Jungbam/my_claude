# platform-devops 상세 규칙 (agent-rules)

> 본문: `plugins/bams-plugin/agents/platform-devops.md` — 차단 게이트/Step 0/라우팅 표/속도 최적화 원칙(IMP-PD-1)은 본문에만 존재 (SSOT)
> 이관 근거: plan_모델재분배프롬프트세분화 FR-S1 (verbatim 이동 — NFR-3)

### ★ Post-Merge Auto Verification SOP (PD-T2)

PR 머지 완료(pipeline_end status=completed) 직후 다음을 실행한다.

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

**근거**: PR #13 머지 시 브랜치 마지막 commit은 validate-agent-sync SUCCESS였으나 main 머지 squash commit은 FAIL(design-director.md 신규 `---` 구분자를 sed 파서가 frontmatter 끝으로 오인). 감지는 다음 파이프라인 진입 시점까지 지연됨. 출처: `.crew/memory/platform-devops/improvements/2026-06-30-post-merge-regression-auto-detect.md`, `retro_최근7d회고_1` Top 4.

### ★ emit 스크립트(bams-viz-emit.sh) 인자 파싱 회귀 방어 (T-DQ-1/T-DQ-2)

`bams-viz-emit.sh` 수정 시 다음 3개 가드가 유지되는지 확인한다 (본 스크립트에 구현 완료 — 회귀 방지 목적으로 명문화):

1. `-`로 시작하는 리터럴은 slug 위치 인자로 거절 (옵션 플래그가 slug로 오유입되는 DQ-3 패턴 차단)
2. `agent_start`/`agent_end`의 agent_type 인자가 `true`/`false` 등 boolean 리터럴이면 즉시 실패 (DQ-2 패턴 차단)
3. 동일 call_id에 대한 `agent_end` 중복 emit 시 warn 로그 출력 (DQ-1 패턴 감지 — fe agent_end 중복 emit)

이 가드를 우회하거나 제거하는 변경은 금지. 수정 후 `bash -n`으로 문법 검증 필수.

### ★ Sidecar 헬스체크 (G-SIDECAR 자동 대응)

dev/feature 파이프라인 시작 전 sidecar 상태를 확인한다:

```bash
_STATUS=$(curl -s -o /dev/null -w "%{http_code}" localhost:3099/api/agents/data 2>/dev/null)
if [ "$_STATUS" = "404" ] || [ -z "$_STATUS" ]; then
  echo "WARN: Sidecar stale 감지 — build-sidecar.sh 실행 필요"
fi
```

### 인프라 관리 원칙
- 모든 인프라 변경은 코드 리뷰를 거친 후 적용한다
- 수동 콘솔 변경은 긴급 상황에 한하며, 사후에 반드시 코드로 반영한다
- 환경별(dev, staging, production) 설정은 변수화하여 단일 코드베이스로 관리한다
- 리소스 네이밍 규칙을 일관되게 적용한다
- 비용 태깅을 통해 리소스 소유자와 목적을 추적 가능하게 한다
- 최소 권한 원칙을 IAM 정책에 적용한다

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

## 학습된 교훈

### [2026-07-01] retro_최근7d회고_1 — emit 로직 결함 4건 + post-merge 회귀 감지 지연 + 경고 방치 재발

**맥락**: retro_최근7d회고_1(scope 7d) — A등급(90.0)이나 Top 1(DQ-1~4 emit 결함), Top 3(경고 즉시 fix 미수행), Top 4(post-merge CI 회귀 감지 지연) 3개 Problem 정면 지적. 4개 부서장 KPT 중 3개가 emit 결함을 정면 지적(4/4 교차 일치).

**문제**:
1. `bams-viz-emit.sh` 인자 파싱 결함 — fe agent_end 중복 emit(DQ-1), agent_type에 `"false"` 리터럴 오염(DQ-2), `--call-id-events.jsonl` 손상(DQ-3), agent_end 누락 8건(DQ-4)
2. PR #13 머지 후 main HEAD validate-agent-sync FAIL이 다음 파이프라인 진입 시점까지 감지되지 않음 (최소 수 시간 지연)
3. Wave3A stat 경고를 이연 → Wave3B에서 FAIL로 재발, 재시도율 33.3% 기여

**교훈**:
- emit 스크립트에 call_id 유일성 assert, agent_type boolean 거절, `-` 리터럴 slug 거절 3개 가드를 구현 완료 — 향후 수정 시 가드 유지 필수
- PR 머지 직후 main 재검증(validate-agent-sync + bun test)을 즉시 실행 — 다음 파이프라인 진입까지 대기 금지
- 경고 감지 시 즉시 fix, 이연 불가피 시 board.md 등록 의무 — 무기록 이연 금지

**출처**: retro_최근7d회고_1 (Top 1/3/4), `.crew/memory/platform-devops/improvements/2026-06-30-post-merge-regression-auto-detect.md`

### [2026-04-18] retro_전체회고_4 — 교훈-행동 단절 패턴 확인

**맥락**: retro_전체회고_4 — B등급(85.0). Preflight 체크 생략(L-2) 2회 연속 반복. pipeline_start 없는 케이스 13건(19.2%). Sidecar 자동화 조치 미완료.

**문제**:
- Preflight 체크가 "원칙 섹션"으로 분리되어 위임 직후 강제 실행되지 않음
- Sidecar 자동화 조치(check-sidecar.sh)가 "Try 제안" 수준에 머물러 실제 구현 미완료
- pipeline_start 없는 케이스 19.2% — 사전 방지 게이트 부재

**교훈**:
- Preflight 체크는 "Step 0"으로 명명하고 첫 번째 행동으로 구조적 전진 배치
- Sidecar 헬스체크는 행동 규칙에 Bash 스크립트로 직접 삽입 (문서화가 아닌 코드)
- pipeline_start 확인을 agent_start emit 전 의무 절차로 규정
- 같은 문제가 세 번째 등장하면 신뢰성 등급 C 이하 조정 대상

**출처**: retro_전체회고_4

### [2026-04-04] retro-all-20260404-3 — 권한 확인 없이 실행으로 재위임 발생

**맥락**: retro-all-20260404-3 회고 — platform-devops 평균 소요시간 111초(글로벌 평균 1.28배). 권한 요구사항 미명시로 재위임 발생 → 추가 10분 소요.

**문제**:
- 위임 수신 즉시 실행 패턴 — 권한 요구사항 사전 확인 절차 부재
- 권한 에러 발생 후 재위임으로 파이프라인 전체 지연

**교훈**:
- 위임 수신 즉시 Preflight 체크 수행이 필수. 10초 체크로 10분 지연을 방지
- 권한 에러 감지 즉시 재시도 없이 pipeline-orchestrator에 에스컬레이션

**출처**: retro-all-20260404-3

### 파이프라인 완료 시 저장

회고 단계에서 pipeline-orchestrator의 KPT 요청 시 `MEMORY.md`에 다음 형식으로 추가:

```markdown
## [YYYY-MM-DD] {pipeline-slug}
- 발견 사항: [이번 파이프라인에서 발견한 패턴 또는 문제]
- 적용 패턴: [성공적으로 적용한 접근 방식]
- 주의사항: [다음 실행 시 주의할 gotcha]
```

### PARA 디렉터리 구조

```
.crew/memory/{agent-slug}/
├── MEMORY.md              # Tacit knowledge (세션 시작 시 필수 로드)
├── life/
│   ├── projects/          # 진행 중 파이프라인별 컨텍스트
│   ├── areas/             # 지속적 책임 영역
│   ├── resources/         # 참조 자료
│   └── archives/          # 완료/비활성 항목
└── memory/                # 날짜별 세션 로그 (YYYY-MM-DD.md)
```

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
