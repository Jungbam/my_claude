---
name: verify-{app}
description: "{App} 검증 스킬 — {surface: 웹 UI / API / CLI}를 로컬에서 띄우고 사용자처럼 직접 조작해 증거를 남긴다. 변경을 '실제로 동작한다'고 말하기 전, /bams:verify, 버그 재현에 사용."
---

<!--
  생성 템플릿 — references/verification-skill-protocol.md 를 따른다.
  모든 {…} 는 리포 인터뷰에서 찾은 실제 값으로 치환한다. 남은 {…} 가 하나라도 있으면 생성 실패.
  해당 없는 섹션 항목은 지우지 말고 "해당 없음: <사유>" 로 적는다.
-->

# Verify {App}

이 스킬을 처음 읽는 에이전트는 앱을 본 적이 없다. 순서대로 실행한다: Launch → Doctor → Drive(features/) → Evidence → Cleanup.

## Status

```
status: draft            # draft | proven
generated_at: {YYYY-MM-DD}
generated_from: {short-sha}
proven_at:
proven_commit:
proven_feature:
evidence:
blocked_by:              # draft 유지 사유 (필요 env 키, 접근 권한, 시도한 명령)
unverified_on_target:    # 대체 환경에서만 증명된 셋업 단계
```

`draft`인 동안 이 스킬의 실행 결과는 제품 판정에 쓰지 않는다. 첫 성공 실행 후 위 블록을 갱신한다.

## Launch

```bash
RUN_ID=$(date +%Y%m%d-%H%M%S)
EVID=".crew/artifacts/test/verify-{app}/$RUN_ID"
mkdir -p "$EVID"
{env 준비: 예) cp .env.example .env.verify — 실제 필요한 키 목록 명시}
{마이그레이션/시드 명령}
{기동 명령} > "$EVID/launch.log" 2>&1 &
echo $! > "$EVID/app.pid"
```

준비 판정: {예) launch.log 에 "Ready on http://localhost:{port}" + `curl -sf http://localhost:{port}/{health}` 200 + 첫 화면 렌더}. 최대 {N}초 대기, 초과 시 launch.log 마지막 50줄을 보고하고 Cleanup.

포트/데이터 격리: {병행 실행 가능 여부와 방법, 불가하면 "공유 인스턴스에는 drive 금지"}.

## Doctor (읽기 전용)

```bash
kill -0 "$(cat "$EVID/app.pid")" && echo "proc OK"
lsof -iTCP:{port} -sTCP:LISTEN -nP | grep "$(cat "$EVID/app.pid")" && echo "port owned"
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:{port}/{health}
{빌드/버전 확인 명령}
```

{ezar 서비스인 경우만 — references/ezar-infra-deploy.md §1 매핑 결과: ezar-infra service: {service}}
{원격 보조 점검(읽기 전용): mcp__ezar-infra__dev_deploy_status, mcp__ezar-infra__dev_pods. 변경 도구 금지.}

Doctor 실패 시 drive하지 않는다. 제품 변경 없이 실패하면 스킬 drift — 이 스킬을 고친다.

## Drive

기능별 레시피는 `features/README.md` 인덱스에서 고른다. 공통 하네스:

- 웹: bams `browse` 스킬. `B=<browse 경로>` 설정 후 `$B goto http://localhost:{port}{route}` → `$B snapshot -i` → `$B click @eN` / `$B fill @eN "…"` → `$B snapshot -D`
- API: `curl -sS -X {METHOD} http://localhost:{port}{path} -H 'content-type: application/json' -d '{…}' -o "$EVID/{feature}.json" -w '%{http_code}\n'`
- CLI: `{cli} {args} > "$EVID/{feature}.out" 2> "$EVID/{feature}.err"; echo $? > "$EVID/{feature}.exit"`

안정 핸들(ARIA role/name, data-testid, route path)만 사용한다. 좌표·탭 순서 금지.

## Evidence

위치: `.crew/artifacts/test/verify-{app}/<RUN_ID>/` — cleanup 대상 아님.

- 행동과 결과 상태를 모두 캡처 (스냅샷 diff, 응답 본문, stdout/stderr/exit code)
- 부수효과 확인 (DB 행, 생성 파일, 발송 메시지) — 화면만으로 판정 금지
- 실제 사용자 경로로만 조작 (테스트 전용 엔드포인트·내부 setter 금지)
- 각 증거 파일에 feature ID와 진입점 기록

## Cleanup

```bash
kill "$(cat "$EVID/app.pid")" 2>/dev/null   # 우리가 띄운 PID만. 이름으로 kill 금지
{스크래치 데이터/임시 env 삭제}
ls "$EVID"                                   # 증거가 남아 있는지 확인
```

## Maintenance

- 이번 diff가 건드리지 않은 기능에서 실패 → 스킬 drift. 이 디렉토리만 고치고 제품 코드는 고치지 않는다.
- 앱 동작이 실제로 깨졌으면 map을 약화하지 말고 결함으로 보고한다.
- 기동 관련 파일(package.json scripts, docker-compose, Makefile, .env.example, 라우트) 변경 시 `/bams:init` 부분 재초기화(Step 11.5 유지보수 모드)로 재실증.
