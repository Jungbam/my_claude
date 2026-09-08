# git-ops-agent Best Practices

## Responsibility: git 관리 skill(sync/rollback/stash/branch) 저비용 실행 전담 — 파괴 명령 dry-run + --yes 게이트 준수

| 블록 | 트리거 | 라인범위 |
|------|--------|----------|
| 브랜치 최신화 (git-sync) | base 브랜치 동기화·rebase onto main·pull latest 위임 | L16-35 |
| 커밋/파일 롤백 (git-rollback) | revert·파일 되돌리기·undo commit 위임 | L38-57 |
| 작업 임시 저장 (git-stash) | 미커밋 변경 보관·pop·stash drop 위임 | L60-78 |
| 브랜치 관리 (git-branch) | 브랜치 생성/이름변경/삭제 위임 | L81-98 |

> **공통 실행 원칙**: (1) `git-rollback`·`git-stash drop`·`git-branch --force`·`git-sync`의 auto-stash 등 파괴 가능성이 있는 명령은 dry-run/미리보기 확인 후에만 `--yes`로 실행한다. 사용자 확인 없는 `--yes` 임의 부착은 금지. (2) `git reset --hard`, `git push --force`, `git push --force-with-lease`는 절대 직접 실행하지 않는다(rollback skill의 revert/restore 경로만 사용). (3) Write/Edit/NotebookEdit 미보유 — git 명령 외 파일 변경 부수 효과 원천 차단. (4) 결과는 exit code + stdout/stderr 요약으로 반환하고, exit 1(승인 대기·게이트 거부)이면 재실행 방법을 함께 안내한다.

---

### 브랜치 최신화 (git-sync)

**언제 참조:** base 브랜치 동기화, rebase onto main, pull latest를 Agent tool로 위임받았을 때

**협업 대상:**
- pipeline-orchestrator/부서장: 착수 전 base 브랜치·전략(ff/rebase/merge) 지정
- ship/land-and-deploy: 머지·배포는 이들이 담당 — sync는 최신화까지만

**작업 절차:**
1. `/git-sync --base {branch} --strategy {ff|rebase|merge}` 형식으로 skill을 실행한다
2. fetch로 원격 최신 상태를 가져온다
3. dirty 감지 시 auto-stash가 동작하므로 stash 대상이 의도한 변경인지 확인한다
4. 전략 실행 후 stash pop으로 로컬 작업을 복원하고 충돌 여부를 보고한다

**산출물:** sync_summary (fetch/stash/전략 실행/stash pop 각 단계 결과 + exit code)

**주의사항:**
- rebase 전략은 히스토리를 재작성한다 — 공유 브랜치에는 팀 합의 없이 적용하지 않는다
- stash pop 충돌 발생 시 임의 해소하지 말고 exit 1로 반환하고 사용자에게 에스컬레이션한다

---

### 커밋/파일 롤백 (git-rollback)

**언제 참조:** revert, 파일 되돌리기, undo commit을 위임받았을 때

**협업 대상:**
- 위임자: dry-run diff 확인 후 롤백 승인 여부를 판단
- careful hook: 실행 직전 파괴 명령 경고(이중 방어) — git skill 사전 게이트와 병존

**작업 절차:**
1. 먼저 dry-run으로 실행해 롤백 범위(diff)를 미리 확인한다
2. dry-run 결과를 위임자에게 보고하고 승인을 확인한다
3. 승인 확인 시에만 `--yes`로 실행한다
4. commit은 `git revert`, file은 `git restore --source`로 index 오염 없이 되돌린다

**산출물:** rollback_preview (dry-run diff), rollback_result (revert/restore 결과 + exit code)

**주의사항:**
- `git reset --hard`로 롤백하지 않는다 — revert/restore 경로만 사용해 히스토리·index를 보존한다
- 사용자 승인 없이 `--yes`를 임의 부착하는 게이트 우회는 금지한다

---

### 작업 임시 저장 (git-stash)

**언제 참조:** 미커밋 변경 임시 보관, pop, stash drop을 위임받았을 때

**협업 대상:**
- 위임자: drop 대상 스태시가 폐기해도 되는 항목인지 최종 확인
- git-sync: sync의 auto-stash와 스택이 겹치지 않도록 순서 확인

**작업 절차:**
1. push/pop/list는 결정론적 매핑이므로 직접 실행한다
2. drop은 먼저 미리보기로 삭제 대상을 확인한다
3. drop 미리보기 결과 확인 후 `--yes` 게이트를 통과해야 삭제한다

**산출물:** stash_result (스택 상태 + 실행 결과 + exit code)

**주의사항:**
- stash drop은 복구 불가 — 반드시 미리보기 + `--yes` 게이트를 거친다
- pop 충돌 시 임의 해소하지 않고 스택을 보존한 채 exit 1로 보고한다

---

### 브랜치 관리 (git-branch)

**언제 참조:** 브랜치 생성/이름변경/삭제를 위임받았을 때

**협업 대상:**
- 위임자: 브랜치명 컨벤션·삭제 강제 여부 지정
- git-branch 컨벤션 SSOT: 정규식 검증 규칙 참조

**작업 절차:**
1. create/rename 시 브랜치명을 컨벤션 정규식으로 검증한다
2. delete는 기본 `-d`(merged 브랜치만) 로 안전하게 실행한다
3. `--force`(=`-D`, 미머지 강제 삭제)는 `--yes` 게이트 통과 시에만 실행한다

**산출물:** branch_result (list/create/rename/delete 결과 + exit code)

**주의사항:**
- 컨벤션 위반 브랜치명은 생성하지 않고 exit 1로 반환한다
- 미머지 브랜치 강제 삭제는 데이터 유실 위험 — `--yes` 없이는 절대 실행하지 않는다
