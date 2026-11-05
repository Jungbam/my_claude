# hook 실발화 smoke — 실제 하네스 디스패치 증거

`run-hook-tests.sh`는 스크립트와 matcher 에뮬레이션까지만 검증한다. 이 절차는 하네스가 plugin.json 등록대로 hook을 실제로 부르는지 확인한다.

**규칙**: `hooks/**`·plugin.json `hooks`를 바꾼 파이프라인은 아래 4단계의 trace 증거(hook 4종)가 없으면 history.md에 COMPLETED가 아니라 **DONE_WITH_CONCERNS**로 기록하고, board.md에 smoke 미실행 항목을 등록한다.

## 1. cache sync + 새 세션
```bash
bash plugins/bams-plugin/sync-cache.sh && bash plugins/bams-plugin/scripts/validate-agent-sync.sh
grep -l bams_hook_trace "$(bash plugins/bams-plugin/scripts/resolve-cache.sh)"/hooks/*.sh   # 4개 출력
rm -rf /tmp/bams-hook-trace.log /tmp/bams-hook-capture
BAMS_HOOK_TRACE=/tmp/bams-hook-trace.log BAMS_HOOK_CAPTURE_DIR=/tmp/bams-hook-capture BAMS_ROUTER=suggest claude   # 반드시 새 세션. prompt-router는 매 입력마다 발화(suggest=자동 실행 없음)
```
`BAMS_HOOK_TRACE=1`이면 `${TMPDIR:-/tmp}/bams-hook-trace.log`에 쓴다. TMPDIR 혼동을 피하려면 위처럼 절대경로를 준다.

## 2. 세션 안에서 3가지 시도
- (a) 메인: `CLAUDE.md`를 Read하고, 실제 있는 문자열로 1글자 Edit을 요청한다. claude-md-guard가 exit 2로 거부하므로 파일은 바뀌지 않는다. old_string이 없으면 입력 검증에서 먼저 끝나 hook이 안 불릴 수 있다.
- (b) 메인: 저장소 안의 스크래치가 아닌 경로에 새 파일 `bams-smoke-probe.ts` Write를 요청한다. delegation-guard는 warn(additionalContext)만 내므로 **권한 프롬프트에서 거부**한다. 자동 수락 모드였다면 즉시 `rm`하고 `git status`로 잔존 0을 확인한다.
- (c) `bams-plugin:frontend-engineering`을 1회 spawn한다: "`/tmp/bams-smoke/probe.ts`만 Write하고 검증 없이 바로 종료". 스크래치 경로라 block은 없고 SubagentStop만 발화한다.

## 3. 증거 확인
```bash
cut -f2 /tmp/bams-hook-trace.log | sort -u       # claude-md-guard / delegation-guard / prompt-router / verify-before-stop
awk -F'\t' '$2=="verify-before-stop"{print $3, $4}' /tmp/bams-hook-trace.log   # SubagentStop bams-plugin:frontend-engineering
```
줄 형식: `epoch<TAB>hook<TAB>hook_event_name<TAB>agent_type<TAB>tool_name`. 네 이름 중 하나라도 없으면 해당 hook의 등록(matcher/command)이 실패한 것이다.

## 4. 캡처를 fixture로 승격
```bash
D=plugins/bams-plugin/tests/hooks/fixtures; C=/tmp/bams-hook-capture
red='with_entries(if (.key|test("session_id|transcript_path$")) then .value="REDACTED" else . end)'
jq "$red" "$(ls -t $C/verify-before-stop-*.json | head -1)" > $D/captured-subagentstop-fe.json
for f in $C/delegation-guard-*.json; do   # 메인(agent_id 없음)·서브(agent_id 있음) 1개씩
  k=$(jq -r 'if .agent_id then "sub" else "main" end' "$f"); jq "$red" "$f" > $D/captured-pretooluse-$k.json
done
bash plugins/bams-plugin/tests/hooks/run-hook-tests.sh   # "실하네스 캡처 fixture" 섹션 PASS 확인
```
캡처본은 커밋 전에 Read로 확인한다(tool_input에 편집 본문이 들어 있다). 결과는 history.md의 해당 파이프라인 블록에 1줄로 남긴다.
