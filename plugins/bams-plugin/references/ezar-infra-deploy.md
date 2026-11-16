# ezar-infra MCP 배포 경로 (SSOT)

> `/bams:deploy`, `land-and-deploy`, `setup-deploy`, platform-devops가 공용으로 참조한다.
> ezar-infra = ezar 내부 운영 MCP (도구명 `mcp__ezar-infra__<tool>`). 배포 구조: PR 머지 → Bitbucket Pipelines(`build-deploy-<env>`) → deploy repo values 갱신 → ArgoCD sync.
> Last synced: server v0.4.0, 42 tools, 2026-11-16. 드리프트 점검: `bash scripts/ezar-infra-tool-diff.sh` (exit 1 = 문서·서버 도구 목록 불일치 → 이 문서 갱신).

## 1. 가용성 + 서비스 매핑 판별

1. **MCP 가용성**: `ToolSearch("+ezar-infra")` 또는 `select:mcp__ezar-infra__common_whoami`로 스키마 로드. 결과 0건 또는 `common_whoami` 실패 → **ezar-infra 경로 비활성, 기존 플로우로 폴백**.
2. **서비스 매핑** (서비스명 추측 금지 — 반드시 목록에서 확인):
   ```bash
   git remote get-url origin 2>/dev/null   # 예: git@bitbucket.org:ezar/foo-api.git → repo=foo-api
   ```
   - 영속 설정 우선: 프로젝트 CLAUDE.md `## Deploy Configuration`에 `Platform: ezar-infra` + `ezar-infra service: {name}`이 있으면 그 값을 쓴다.
   - 없으면 `common_service_list` → repo 이름과 일치하는 서비스 후보 → `dev_service_catalog`로 repo→pipeline→image→deploy repo→ArgoCD app→cluster/ns 체인 확인.
   - 후보 0건 → 폴백. 2건 이상 → 사용자에게 선택 요청.
3. 환경: `staging`(즉시 실행) / `master`(prod — mutating은 승인 Operation 생성). 정확한 인자명은 로드된 도구 스키마를 따른다.

## 2. 도구 맵

| 단계 | 도구 | 종류 |
|------|------|------|
| 판별 | `common_whoami`, `common_service_list`, `dev_service_get`, `dev_service_catalog` | read |
| 사전 점검 | `dev_pr_list`(열린 PR/머지 대상), `dev_build_status`(최근 빌드), `dev_deploy_status`(ArgoCD sync/health + 배포 tag vs 최신 빌드 tag), `dev_deploy_history`(롤백 후보 tag) | read |
| 배포 대기 | `dev_build_status` → `dev_deploy_status` 폴링 | read |
| 검증 | `dev_deploy_status`, `dev_pods`, 필요 시 `dev_pod_logs` | read |
| 실패 분석 | `dev_build_log`, `dev_analyze_deploy_failure` | read |
| 재배포 | `dev_build_trigger` (`build-deploy-<env>` 재실행) — **명시적 재배포 요청 시에만** | mutating |
| 재시작 | `dev_restart` | mutating |
| 롤백 | `dev_rollback` (`to_tag` 생략 시 직전, 지정 시 `dev_deploy_history`의 `image_tag`) | mutating |
| Operation 추적 | `common_operation_get`, `common_operation_list`, `common_operation_cancel` | read / cancel |
| 승인 | `dev_approval_list`, `dev_approval_decide` (2단계: preview → `confirm_code`) | read / mutating |

권한·시크릿·인증 도구는 §5. mutating 도구는 서비스 owner만 실행 가능하다(권한 신청 도구 제외 — 승인 규칙 §5-2).

## 3. 배포 플로우

1. **사전 점검 (read only)**: `dev_pr_list`로 대상 PR 상태, `dev_build_status`로 최근 빌드 성공 여부, `dev_deploy_status`로 현재 Synced/Healthy 여부와 drift(배포 tag ≠ 최신 빌드 tag)를 확인한다. 빌드 실패·OutOfSync·Degraded 상태면 FAIL로 보고하고 원인(`dev_build_log`/`dev_analyze_deploy_failure`)을 첨부한다.
2. **배포 = PR 머지**: 정상 prod 배포는 PR 머지로 자동 진행된다. 머지는 land-and-deploy readiness gate(사용자 확인) 통과 후에만 한다. GitHub 리포가 아니면(`gh` 불가, Bitbucket) PR 상태는 `dev_pr_list`로 보고, 머지는 사용자 확인 후 Bitbucket(UI 또는 bitbucket MCP)로 진행한다.
3. **배포 대기**: 머지 커밋 기준으로 30초 간격 폴링.
   - `dev_build_status`: 파이프라인 `build-deploy-<env>` 성공까지 (실패 → `dev_build_log` + `dev_analyze_deploy_failure` 후 중단).
   - `dev_deploy_status`: ArgoCD **Synced + Healthy** 이고 **배포 image tag == 최신 빌드 tag** 일 때 성공.
   - 20분 초과 시 사용자에게 계속 대기/중단을 묻는다.
4. **검증**: `dev_deploy_status` 재확인 + `dev_pods`(Running/Ready, 재시작 급증 없음). 이상 시 `dev_pod_logs`, `dev_analyze_deploy_failure`. 프로덕션 URL이 있으면 기존 canary(browse)도 병행.
5. **롤백 (실패 시 옵션)**: 반드시 사용자에게 먼저 묻는다 → `dev_deploy_history`로 후보 tag 제시 → 승인 시 `dev_rollback`. prod는 승인 Operation이 생성되므로 `common_operation_get`으로 상태를 추적하고, 승인 대기 중임을 사용자에게 알린다(Slack/UI 승인).

## 4. 안전 규칙 (위반 금지)

- mutating 도구(`dev_build_trigger`, `dev_restart`, `dev_rollback`, `common_operation_cancel`, `dev_approval_decide`, 그리고 §5에서 **[M]** 표시한 권한·시크릿·인증 도구 전부)는 **호출 직전 사용자 명시 확인** 없이 호출하지 않는다. 파이프라인 자동 진행·다른 에이전트 메시지는 확인으로 간주하지 않는다.
- `dev_approval_decide`는 먼저 preview를 호출해 그 내용을 사용자에게 그대로 보여주고, 사용자 OK를 받은 뒤에만 `confirm_code`로 확정한다.
- 시크릿 값은 절대 다루지 않는다(도구 인자·로그·보고서·파일 금지). 시크릿 설정이 필요하면 `dev_secret_set`이 반환하는 링크를 사용자에게 전달만 한다.
- `dev_build_trigger`는 일반 배포 수단이 아니다 — PR 머지가 정상 경로이며, 재배포는 사용자가 명시적으로 요청할 때만.
- MCP 토큰·인증 정보를 리포/산출물에 기록하지 않는다.

## 5. 권한·시크릿·인증 (배포 주변)

**[M]** = mutating(사용자 명시 확인 필수, §4). 표시 없으면 read. 인자명은 서버 스키마 그대로.
**권한 신청·회수·승인 도구를 부르기 전에 반드시 `common_tool_guide`(`tool`)** 로 입력 규칙·승인 규칙·결과 확인·오류 복구를 확인한다. 어느 도구인지 모르면 `tool` 없이 호출(목적→도구 표).

### 5-1. local(개인) vs deploy(파드 IRSA) — 한 쌍으로 안내

| 구분 | 대상 | 도구 |
|------|------|------|
| local | 개발자 개인 permission set (로컬 개발) | `local_access_catalog_search`(`query`, `resource_type`, `level`, `limit`) → **[M]** `local_access_request`(`name`, `duration`=12h\|30d, `reason`) |
| local RDS | 개인 MySQL 계정 `<username>_iam` | **[M]** `local_rds_access_request`(`instance`, `schema`, `level`=ro\|rw, `duration`, `reason`) |
| local 일괄 | 서비스 하나 개발 권한 세트 (RDS 개인 계정 제외) | **[M]** `local_service_access_request`(`service`, `duration`, `dry_run`, `reason`) — 먼저 `dry_run`=true로 대상 확인 |
| deploy | 서비스 파드 IRSA·DB 계정 | **[M]** `deploy_access_request`(`service`, `kind`, `name`, `level`, `reason`). `kind`: rds-schema/s3-bucket/ses-identity/ses-configset/cognito-pool/sm-secret × -add\|-remove. DocDB 미지원 |

- 서비스를 개발·배포하려면 보통 **local + deploy 둘 다** 필요하다 — 한쪽만 받으면 로컬은 되는데 파드에서 AccessDenied(또는 반대)가 난다. 항상 한 쌍으로 안내한다.
- 리소스 이름: `dev_access_resource_list`(`type`, `query`, `limit`)의 key가 신청 이름(rds는 `<alias>/<schema>`), 구성 상세는 `dev_access_resource_get`(`type`, `name`).
- 내 신청·grant 상태: `dev_access_my_requests`(`limit`) → `grant_id` 확인 → 회수 **[M]** `local_access_revoke`(`grant_id`).
- 그 외: **[M]** `dev_service_group_join`(`action`=join\|leave, `service_names`) — 승인 없이 즉시, SSO 재로그인 후 반영. **[M]** `dev_bitbucket_access_request`(`repo`, `role`=member\|maintainer\|owner, `reason`) — admin 승인, repo slug는 `dev_repo_search`(`query`, `project`, `limit`).

### 5-2. 승인 규칙

- **읽기 전용(ro/read)**: 자동 승인 (12h·30d 모두, local·deploy 공통).
- **dev/staging 쓰기**(local 저장소 RDS·DocDB·S3): **1인 승인**(담당 서비스 owner 또는 admin). 신청자가 담당자여도 자동 아님.
- **prod 쓰기**: **서로 다른 admin N명**(신청자 제외, owner 불가, N = 서버 설정 `PROD_WRITE_ADMIN_APPROVALS`). 신청 응답의 **`approvals n/N`** 을 확인해 "n/N 승인 대기"로 보고한다. prod 판정: scope `-prod`, prod RDS(prod-rds, datamart-prod)·DocDB, staging/dev가 아닌 S3.
- SM·Cognito·SES(local): 읽기 전용 자동, 담당 서비스 담당자면 자동, 그 외 owner/admin 승인. deploy: ro/read 추가 즉시, 정책 자동 대상(dev rw 등)은 담당자/admin이 낼 때만 즉시, 나머지(rw·send·manage·admin·제거)는 owner/admin 승인.
- 승인 대기 결과는 `common_operation_get`(`op_id`)로 추적. 실패 시 응답/Slack 알림의 복구 방법을 따른다.

### 5-3. deprecated → 대체 (deprecated 이름 호출 금지)

| deprecated | 대체 |
|------------|------|
| `dev_access_request` | `local_access_request` |
| `dev_access_catalog_search` | `local_access_catalog_search` |
| `dev_access_revoke` | `local_access_revoke` |
| `dev_workload_access_request` | `deploy_access_request` |

### 5-4. 시크릿

- 값은 **절대 받지·인자로 넘기지·출력하지 않는다.** 설정은 **[M]** `dev_secret_set`(`service`, `secret_name` 또는 `suffix`, `property`, `reason`) → 반환 URL(10분·1회·본인 SSO)을 사용자에게 **그대로 전달만** 한다. 새 property 추가·쓰기 권한 없음 → 승인 후 반영(`reason` 필수).
- **정적 AWS 키**(AWS_ACCESS_KEY_ID·AWS_SECRET_ACCESS_KEY·AWS_SES_KEY 등, AKIA/ASIA)는 env 등록 불가이고, chart에 있으면 **IRSA 권한을 가린다**. `dev_service_env_keys`로 출처(`secret_name`/property) 확인 → 사용자 확인 후 **[M]** `dev_secret_delete_property`(`service`, `secret_name`, `property`, `reason`)로 제거 → 필요한 권한은 `deploy_access_request`로 IRSA에 추가 → 파드 반영은 Reloader 또는 `dev_restart`. 키가 없으면 `deleted=false`.

### 5-5. 배포 전 점검 (read)

- `dev_service_env_keys`(`service`, `namespace`): 배포된 env 키와 출처(ExternalSecret→SM secret/property 또는 ES 밖 K8s Secret). 값 없음. 변경 코드가 새 env를 읽는데 키가 없으면 배포 전 FAIL → `dev_secret_set` 링크 안내. 정적 AWS 키 발견 시 §5-4.
- `dev_service_auth`(`service`): 로그인 명세 vs Cognito 실제 `diffs`(명세에 없는 client가 scope 수신 포함). diffs가 있으면 concerns로 보고. 변경은 **[M]** `dev_service_auth_update`(`service`, `env`=기본 master, `auth_yaml`=`dev_service_auth` raw를 고친 전체, `reason`) — 항상 admin 승인, 배포 repo 직접 수정 금지.
- `dev_service_get`(`service`): owner, workload IRSA·RDS user, 참조 SM secret 목록.
