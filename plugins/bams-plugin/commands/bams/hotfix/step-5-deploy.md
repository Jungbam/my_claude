# Hotfix: Step 5 — 배포

> 이 파일은 `/bams:hotfix`의 Step 5를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다 (엔트리포인트에서 이미 로드됨).

## 입력 컨텍스트

- slug: {엔트리포인트에서 결정된 slug}
- _DEPLOY_SKILL: 공통 규칙에서 로드된 Deploy 스킬 경로

---

## Step 5: 배포 (bams deploy 스킬, 선택)

**루프 A — 단일 부서장 직접 spawn (배포 환경 점검은 platform-devops 단일 책임).**

Task tool, subagent_type: **"bams-plugin:platform-devops"** — 메인이 직접 호출:
<!-- load_profile:exempt inherits _shared_common §위임 원칙 -->

> **Hotfix Step 5 — 배포 환경 점검**
>
> ```
> task_description: "핫픽스 배포 환경을 점검하라"
> input_artifacts:
>   - .crew/config.md
> expected_output:
>   type: deploy_precheck
> quality_criteria:
>   - 배포 환경 상태 확인
>   - 롤백 준비 확인
>   - 즉시 배포 가능 여부 판정
> constraints:
>   urgency: critical
> ```

AskUserQuestion — "즉시 배포할까요?"
- **나중에 (Recommended)**
- **배포** — verdict 확인 후 `_DEPLOY_SKILL` 실행

**verdict 확인 (배포 선택 시)**: `_DEPLOY_SKILL`을 직접 실행하는 경로라 `/bams:deploy`의 확인을 거치지 않는다. 배포 직전 아래 블록을 **한 번의 Bash 호출**로 실행해(리졸버와 check를 같은 호출에 — 셸 변수는 호출 사이에 남지 않는다, exit 규약: `references/verdict-protocol.md` §4) `verdict_exit=0`일 때만 배포한다. `verdict_exit=unavailable`(verdict.sh 못 찾음)이면 배포하지 않고 "나중에"로 처리하며 "verdict 확인 불가(도구 없음)"를 보고한다.

```bash
_BAMS=$( { jq -r '[.plugins["bams-plugin@my-claude"] // empty] | flatten | sort_by(.scope != "user") | .[].installPath // empty' ~/.claude/plugins/installed_plugins.json; sh -c 'ls -dt "$HOME"/.claude/plugins/cache/*/bams-plugin/*/'; } 2>/dev/null | while IFS= read -r _p; do [ -d "$_p" ] && [ ! -e "$_p/.orphaned_at" ] && echo "${_p%/}" && break; done || true); _VD="$_BAMS/hooks/lib/verdict.sh"; [ -e "$_VD" ] || _VD=""; [ -z "$_VD" ] && _VD=$(find . -path "*/bams-plugin/hooks/lib/verdict.sh" 2>/dev/null | head -1)
if [ -z "$_VD" ]; then echo "verdict_exit=unavailable (verdict.sh 못 찾음 — 'verdict 없음'(1)과 다르다)"; else bash "$_VD" check; echo "verdict_exit=$?"; fi
```

 exit 3(FAIL) = 중단, exit 1·4(무효) = Step 4 release-quality-gate의 판정 기록 누락 → 기록 재요청 1회 후에도 exit≠0이면 배포하지 않고 "나중에"로 처리.

---

## Step 5 게이트 조건

- [ ] 배포 환경 점검 완료
- [ ] 배포 실행 시 `verdict.sh check` exit 0 확인
- [ ] 배포 실행 완료 (또는 나중에 처리)

Step 5 완료 → 엔트리포인트가 Finalization을 라우팅합니다.
