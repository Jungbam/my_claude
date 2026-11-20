# issue-ops Best Practices

## Responsibility: 레포별 Linear 매핑 관리 · 확인된 지적의 이슈 등록 (ezar-linear 규칙)

| 블록 | 트리거 |
|------|--------|
| 매핑 (linear-setup) | 처음 쓰는 레포, 매핑 검증 실패, 프로젝트가 여러 팀에 걸침 |
| 등록 (linear-file-issues) | review·deep-review·qa 리포트 확정 직후, `/bams:issues file` |
| 실패 | ezar-linear·Linear MCP 없음, 인증 만료, 훅 거부 |

> **공통 원칙**: 전사 규칙은 `ezar-linear:issues` 스킬과 ezar-linear 훅이 정하고, bams 규약은 `references/linear-protocol.md`가 SSOT다. 초안을 먼저 보이고, 질문은 `NEEDS_CONTEXT`로 메인에 넘기고, 상태는 옮기지 않는다.

### 매핑 (linear-setup)

**언제 참조:** `.crew/config.md`에 `## Linear`가 없거나 검증이 실패했을 때.

**작업 절차:**
1. 저장소 CLAUDE.md·AGENTS.md의 Linear 절을 먼저 본다. 있으면 그 값이 1순위 후보다.
2. git remote 이름을 정규화해 프로젝트 이름과 점수를 매긴다. 이름이 비슷해도 다른 팀 프로젝트일 수 있으니 (팀, 프로젝트) 쌍으로 후보를 낸다.
3. 후보 3개 + 팀만 지정 + 연동 끄기를 `NEEDS_CONTEXT`로 반환한다.
4. 메인이 받아 온 선택을 다시 검증한 뒤 섹션 하나만 바꾼다.

**주의사항:**
- 이름에 `archive`가 들어간 팀(Jira Archive 등)은 후보에서 뺀다.
- 사용자가 "연동 끄기"를 고르면 `enabled: false`를 기록해 다시 묻지 않는다.
- 라벨·프로젝트가 없다고 만들지 않는다(훅 G1·G2). 빠진 것은 보고만 한다.

### 등록 (linear-file-issues)

**언제 참조:** 리포트가 저장되고 검증(CONFIRMED·unverified-risk)이 끝난 뒤.

**작업 절차:**
1. 대상만 고른다: CONFIRMED Critical/Major, unverified-risk. Minor는 `--all`일 때만.
2. 출처 ID `"bams:<repo>/<fp>"`를 큰따옴표째 `query`에 넣어 워크스페이스 전체에서 찾는다. 못 찾으면 최근 하루 이슈와 낱말 검색으로 한 번 더 본다.
3. 판정(만들기·댓글·건너뜀)과 근거를 붙인 초안 표와 초안 파일을 만들어 `NEEDS_CONTEXT`로 반환한다.
4. `--confirmed`로 돌아오면 초안 그대로, 확인된 번호만 쓴다.

**자주 하는 실수:**
- 출처 ID를 따옴표 없이 검색한다 → `/`·`-`에서 낱말이 갈려 엉뚱한 이슈가 같은 이슈로 걸린다.
- 줄 번호를 지문에 넣는다 → 코드가 조금만 움직여도 중복 이슈가 생긴다. 위치는 경로만.
- 제목에 `[미검증]`·`[BUG]`·파일명·줄표를 넣는다 → 훅 G6에 막힌다. 미검증 위험은 Research 종류로 올리고 확인할 질문을 제목으로 쓴다.
- 닫힌 같은 이슈를 다시 연다 → 새 이슈를 만들고 `relatedTo` + "다시 생김".
- 우선순위·담당자를 채운다 → ezar 규칙상 사용자가 말했거나 장애일 때만. 심각도는 본문에 쓴다.
- `needs-triage`·`ready-for-agent` 같은 진행 라벨을 붙인다 → 라벨은 종류 하나만. 진행은 상태로 나타낸다.

### 실패

**작업 절차:**
1. ezar-linear가 없으면 쓰지 않고 `BLOCKED`로 설치 방법을 돌려준다.
2. 도구 오류·인증 만료는 그 항목만 `failed`로 보고하고 나머지는 진행한다.
3. 훅 거부는 사유대로 한 번 고쳐 다시 호출하고, 또 막히면 `failed`.
4. 로컬 대기열은 없다. `/bams:issues file <리포트>`를 다시 실행하면 출처 ID로 이미 올린 것은 걸러진다.

## 체크리스트

- [ ] `ezar-linear:issues`를 로드한 뒤 시작했다
- [ ] 매핑이 archive 팀이나 닫힌 프로젝트를 가리키지 않는다
- [ ] 모든 새 이슈 본문 Agent notes에 `출처 ID: bams:<repo>/<fp>`가 있다
- [ ] 종류 라벨 하나, 제목 60자 이하, `[`·`—` 없음
- [ ] 근거 발췌의 비밀값·개인정보를 지웠다
- [ ] 사용자가 확인한 항목만 썼다
- [ ] 반환에 만든 이슈의 식별자와 출처 ID가 모두 있다

## 참고

- 전사 규칙: `ezar-linear:issues` 스킬(`references/types.md`·`statuses.md`·`writing.md`)
- 규약 SSOT: `references/linear-protocol.md`
- 심각도·검증 결과 정의: `references/multi-perspective-review.md` §지적 검증 필터, `references/issue-severity.md`
