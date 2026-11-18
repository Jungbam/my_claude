# issue-ops Best Practices

## Responsibility: 레포별 Linear 매핑 관리 · 확인된 지적의 이슈 등록 · 증거 기반 상태 동기화

| 블록 | 트리거 | 
|------|--------|
| 매핑 (linear-setup) | 처음 쓰는 레포, 매핑 검증 실패, 프로젝트가 여러 팀에 걸침 |
| 등록 (linear-file-issues) | review·deep-review·qa 리포트 확정 직후 |
| 상태 동기화 (linear-close-issues) | hotfix·dev·debug 시작·검증 통과, ship·deploy 이후 sweep |
| 실패·대기열 | Linear MCP 없음, 인증 만료, 부분 실패 |

> **공통 원칙**: 규약은 `references/linear-protocol.md`가 SSOT다. 파이프라인을 막지 않고, 질문은 `NEEDS_CONTEXT`로 메인에 넘기고, 증거 없이 Done으로 옮기지 않는다.

### 매핑 (linear-setup)

**언제 참조:** `.crew/config.md`에 `## Linear`가 없거나 검증이 실패했을 때.

**작업 절차:**
1. git remote 이름을 정규화해 프로젝트 이름과 점수를 매긴다. 이름이 비슷해도 다른 팀 프로젝트일 수 있으니 (팀, 프로젝트) 쌍으로 후보를 낸다.
2. 후보 3개 + 팀만 지정 + 연동 끄기를 `NEEDS_CONTEXT`로 반환한다.
3. 메인이 받아 온 선택을 다시 검증한 뒤 섹션 하나만 바꾼다.

**주의사항:**
- 이름에 `archive`가 들어간 팀(Jira Archive 등)은 후보에서 뺀다.
- 사용자가 "연동 끄기"를 고르면 `enabled: false`를 기록해 다시 묻지 않는다.
- 라벨이 없다고 만들지 않는다. 빠진 라벨은 보고만 한다.

### 등록 (linear-file-issues)

**언제 참조:** 리포트가 저장되고 검증(CONFIRMED·unverified-risk)이 끝난 뒤.

**작업 절차:**
1. 대상만 고른다: CONFIRMED Critical/Major, unverified-risk. Minor는 플래그가 있을 때만.
2. fingerprint → 장부 → `list_issues(query: <fp>)` 순으로 같은 이슈를 찾는다.
3. 계획(created/updated/reopened/skipped)을 먼저 확정하고, 생성+재오픈이 10건을 넘으면 확인을 요청한다.
4. 사람이 읽는 3줄(문제·근거·영향) + 접힌 Agent notes로 만든다.

**자주 하는 실수:**
- 줄 번호를 fingerprint에 넣어 코드가 조금만 움직여도 중복 이슈를 만든다 → 위치는 경로만.
- 같은 파이프라인 재실행마다 "재발견" 코멘트를 단다 → `last_seen_pipeline`으로 막는다.
- 사람이 Canceled 처리한 이슈를 다시 연다 → canceled·duplicate는 건드리지 않는다.

### 상태 동기화 (linear-close-issues)

**언제 참조:** 수정 파이프라인 시작(식별자 있음), 검증 통과, PR 생성 후, 배포 후.

**작업 절차:**
1. start: backlog·unstarted만 In Progress로 옮긴다. 이미 닫힌 이슈는 보고만 한다.
2. close: 수정 커밋 → 검증 명령 직접 실행 → 머지 여부 순서로 판정한다.
3. 커밋 전이면 `awaiting: commit`, PR 전이면 `awaiting: pr`, PR이 열려 있으면 In Review + `awaiting: merge`.
4. 기본 브랜치에 들어간 것이 확인될 때만 Done + 커밋·PR·검증 코멘트.

**자주 하는 실수:**
- 리포트의 "테스트 통과" 문장을 증거로 쓴다 → 이번 실행에서 직접 돌린 명령만 증거다.
- 기능 브랜치 커밋만 보고 Done 처리한다 → 머지 전에는 In Review까지만.
- 허용 목록 밖의 `repro_cmd`(쓰기·배포 명령)를 실행한다 → `repro_ok`가 거짓이면 실행하지 않는다.

### 실패·대기열

**작업 절차:**
1. 실패한 작업은 `.crew/linear-pending.json`에 op·인자·사유와 함께 쌓는다.
2. 다음 실행 시작 때 먼저 비운다. fingerprint 덕분에 다시 실행해도 중복이 생기지 않는다.
3. 반환에는 `pending N (<사유>)`를 꼭 넣어 메인이 사용자에게 알릴 수 있게 한다.

## 체크리스트

- [ ] 매핑이 archive 팀이나 닫힌 프로젝트를 가리키지 않는다
- [ ] 등록 전에 fingerprint로 장부와 Linear를 모두 조회했다
- [ ] 증거 발췌의 비밀값·개인정보를 가렸다
- [ ] Done 전이마다 커밋·검증 명령·머지 확인이 모두 있다
- [ ] 반환에 생성·전이한 식별자 전부와 장부·대기열 경로가 있다

## 참고

- 규약 SSOT: `references/linear-protocol.md`
- 심각도·검증 결과 정의: `references/multi-perspective-review.md` §지적 검증 필터, `references/issue-severity.md`
- verdict 확인: `references/verdict-protocol.md` §4
