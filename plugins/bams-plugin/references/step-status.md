# Pipeline Step 상태 정의

진행 추적 파일의 Step 상태값 정의입니다.

## 상태값

| 상태 | 의미 | 마무리 표시 |
|------|------|-------------|
| `pending` | 아직 시작하지 않음 | ○ |
| `in_progress` | 현재 실행 중 | ◐ |
| `done` | 성공적으로 완료 | ✓ |
| `fail` | 실행했으나 실패 | ✗ |
| `skipped` | 조건 미충족으로 건너뜀 | ⊘ |
| `skipped (GSTACK_NOT_AVAILABLE)` | gstack 필요 단계, 미설치 | ⚠ |
| `skipped (사용자 선택)` | 사용자가 건너뛰기 선택 | ⊘ |
| `skipped (이미 존재)` | 이전 결과 재사용 | ↺ |
| `skipped (최근 실행)` | 최근 실행 결과 유효 | ↺ |
| `skipped (<사유>)` | 그 밖의 건너뜀 — 사유 필수 (작업 목록 항목의 `— skip: <사유>`와 동일 문구) | ⊘ |
| `interrupted` | 외부 요인으로 중단됨 (recover 프로토콜 대상) | ⚡ |

## Pipeline 상태값

| 상태 | 의미 |
|------|------|
| `in_progress` | 파이프라인 실행 중 |
| `completed` | 모든 단계 완료 |
| `paused_at_step_N` | 사용자가 N단계에서 중단 |
| `failed_at_step_N` | N단계에서 실패 후 중단 |

## Steps 체크리스트 규약 (작업 목록 도구 — SSOT)

파이프라인 커맨드(`init`, `plan`, `feature`, `dev`, `hotfix`, `review`, `deep-review`, `ship`, `deploy`)는 본문 상단에 번호 매긴 `## Steps` 체크리스트를 두고, 그 첫 항목은 항상 `0. Steps 등록`(이 등록 자체)이다. 번호를 0으로 두는 것은 기존 Step 번호(예: review 13·deep-review 12의 verdict step — 완료 조건·Stop hook 안내가 참조)를 바꾸지 않기 위해서다. 커맨드 본문에는 아래 규약의 한 줄 요약만 두고, 상세는 이 절이 SSOT다.

**작업 목록 도구** — Claude Code 버전마다 다르다. 있는 쪽을 쓴다:

| 도구 | 등록 | 진행 갱신 | 비고 |
|------|------|-----------|------|
| `TaskCreate` / `TaskUpdate` | `## Steps` 한 줄당 `TaskCreate` 1회 (`subject` = 원문 줄) | `TaskUpdate`로 `status`(`in_progress`/`completed`)·`subject` 갱신 | deferred tool — 스키마가 로드돼 있지 않으면 먼저 `ToolSearch` query `select:TaskCreate,TaskUpdate`로 로드한 뒤 호출 |
| `TodoWrite` | 한 번의 호출로 전체 목록(`todos[]`, 항목 `content` = 원문 줄) | 같은 목록을 상태만 바꿔 다시 `TodoWrite` | `TodoWrite`가 있는 버전에서만 |

도구 목록에 둘 다 안 보인다고 등록을 생략하지 않는다 — `TaskCreate`는 deferred라 처음엔 이름만 보이는 것이 정상이며, `ToolSearch`로 로드하면 호출할 수 있다.

1. **첫 동작으로 원문 등록**: 커맨드 실행 첫 동작(필요하면 `ToolSearch` 로드만 그보다 먼저)으로 `## Steps`의 각 줄을 **문구 그대로** 작업 목록 항목으로 만든다(요약·병합·재번호 금지 — `0. Steps 등록`도 포함하고 등록 직후 `completed`). 재개 시에도 같은 목록을 다시 만들고 완료분만 `completed`로 둔다.
2. **진행 표시**: 실행 중 step은 `in_progress`(동시에 1개), 끝나면 `completed`(`TaskUpdate` 또는 `TodoWrite` 재호출). 실패는 항목 끝(subject/content)에 `— fail: <사유>`를 붙이고 남긴다.
3. **건너뛰기는 삭제가 아니라 표기**: 실행하지 않는 step은 항목을 지우지 않고 끝(`TaskUpdate`의 `subject` 또는 `TodoWrite` 항목 `content`)에 `— skip: <사유>`를 붙여 `completed`로 둔다. 사유 없는 skip 금지. 예: `5. Phase 2-c 두 번 설계 — skip: --design-twice 미지정`.
4. **세부 단계는 덧붙이기만**: 서브파일의 하위 step을 추적하고 싶으면 해당 step 아래에 항목을 추가할 수 있지만 원문 step을 바꾸거나 지우지 않는다.
5. **추적 파일과 일치**: 진행 추적 파일(`templates/*-tracking.md`)이 있으면 skip은 상태 `skipped (<사유>)`로 같은 사유를 기록한다.
6. **최종 보고**: 완료 요약에 skip·fail 항목과 사유를 그대로 나열한다(누락된 step이 사후에 보이도록).
7. **경량 경로 skip 문구**: `review`·`deep-review` 경량 경로(`references/lightweight-path-protocol.md` §8)에서 건너뛰는 spawn step은 `— skip: lightweight (<n> lines, <m> files)`로 측정값을 그대로 적는다. 판정자·검증자 spawn step과 마지막 완료 산출물 step은 경량에서도 skip 사유가 될 수 없다(§8-4).

## 완료 조건 마커 (Stop hook 검사 대상)

`review`·`deep-review`·`ship`·`deploy`는 문서 끝에 `## 완료 조건` 블록을 두고, 마지막 Step을 아래 완료 산출물로 둔다. 판정 마커:

| 마커 | 정의 |
|------|------|
| step skip | 작업 목록 항목(`TaskCreate`/`TaskUpdate` 입력 또는 `TodoWrite` 항목) 또는 최종 메시지 줄에 `skip:`이 들어 있음 (사유 필수) |
| Steps 등록 | 세션에서 작업 목록 도구(`TaskCreate`/`TaskUpdate`/`TodoWrite`)가 호출됐고, 해당 커맨드 `## Steps` 항목(0번 포함)이 원문 그대로 등록돼 있음 |
| review 완료 산출물 | 이번 세션에 생성된 `.crew/artifacts/review/verdict-*.json` 파일(`hooks/lib/verdict.sh write`가 작성) — 없으면 마지막 Step이 `skip:` 포함 |
| ship·deploy 완료 산출물 | 이번 세션에 Verdict 확인 블록(`verdict.sh check`) 실행 + 최종 메시지에 `verdict_exit=<0\|1\|3\|4\|unavailable>` 1줄 |

| 커맨드 | 마지막 Step | 기본 skip |
|--------|-------------|-----------|
| `review` | verdict 파일 확인 | 허용 사유만: gate CONDITIONAL · git 저장소 아님 · verdict.sh unavailable · 판정자 재기록 실패 |
| `deep-review` | verdict 파일 | `— skip: deep-review 게이트 미포함 (판정은 /bams:review·/bams:ship)` (기본) |
| `ship` | verdict 확인 결과 기록 | skip 불가 — `verdict_exit=unavailable`도 결과로 기록 |
| `deploy` | verdict 확인 결과 기록 | skip 불가 — 동일 |

## 재개 규칙

`status: in_progress` 또는 `paused_at_step_N`인 파이프라인 발견 시:
1. 마지막 `done`인 Step의 다음 Step부터 재개
2. `fail`인 Step은 재시도 여부를 물어봄
3. `skipped`인 Step은 건너뜀 유지 (사용자가 요청하면 재실행)
