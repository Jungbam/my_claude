---
name: verify-todo-api
description: "todo-api 검증 스킬 — API를 로컬에서 띄우고 curl로 사용자처럼 조작해 증거를 남긴다. /bams:verify, 버그 재현에 사용."
---

<!--
  check-verify-skill.sh 테스트 fixture. 이 주석 안의 {…} 는 검사 대상이 아니다.
  run.sh 가 __STATUS__ / __COMMIT__ / __EVIDENCE__ / __PROVEN_AT__ / __FEATURE__ 를 치환한다.
-->

# Verify todo-api

순서대로 실행한다: Launch → Doctor → Drive(features/) → Evidence → Cleanup.

## Status

```
status: __STATUS__            # draft | proven
generated_at: 2026-11-16
generated_from: 0000000
proven_at: __PROVEN_AT__
proven_commit: __COMMIT__
proven_feature: __FEATURE__
evidence: __EVIDENCE__
blocked_by:
unverified_on_target:
```

## Launch

```bash
RUN_ID=$(date +%Y%m%d-%H%M%S)
EVID=".crew/artifacts/test/verify-todo-api/${RUN_ID}"
mkdir -p "$EVID"
cp .env.example .env.verify
bun run db:migrate && bun run db:seed
PORT=4310 bun run start > "$EVID/launch.log" 2>&1 &
echo $! > "$EVID/app.pid"
for i in $(seq 1 30); do curl -sf http://localhost:4310/health >/dev/null && break; sleep 1; done
```

준비 판정: launch.log 에 "listening on 4310" + `/health` 200.

## Doctor (읽기 전용)

```bash
kill -0 "$(cat "$EVID/app.pid")" && echo "proc OK"
[ -f "$EVID/app.pid" ] || { echo missing pid; exit 1; }
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:4310/health
ls src/{routes,lib}
```

## Drive

- API: `curl -sS -X POST http://localhost:4310/todos -H 'content-type: application/json' -d '{"title":"verify"}' -o "$EVID/create.json" -w '%{http_code}\n'`

## Evidence

위치: `.crew/artifacts/test/verify-todo-api/<RUN_ID>/` — cleanup 대상 아님.

## Cleanup

```bash
kill "$(cat "$EVID/app.pid")" 2>/dev/null
rm -f .env.verify
ls "$EVID"
```
