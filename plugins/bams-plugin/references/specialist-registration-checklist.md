# 신규 Specialist 등록 체크리스트

신규 specialist 추가 시(예: `foo-bar`):

## 1. 핵심 파일 작성
- [ ] `plugins/bams-plugin/agents/foo-bar.md` 작성 (frontmatter + 본문)
  - [ ] frontmatter `name` / `description` / `model` / `department` / `disallowedTools`
  - [ ] 본문 §역할 / §전문 영역 / §행동 규칙 / §출력 형식 / §도구 사용 / §협업
  - [ ] 본문에 `---` 섹션 구분자 사용 금지 (validate-agent-sync sed 호환)

## 2. SSOT 등록 (1 위치만 수정 — sync-specialists.ts가 나머지 자동 갱신)
- [ ] `plugins/bams-plugin/.claude-plugin/plugin.json` agents 배열에 `./agents/foo-bar.md` 추가
- [ ] `bun run plugins/bams-plugin/scripts/sync-specialists.ts --apply` 실행
- [ ] 5 TARGET 자동 갱신 확인 (delegation-protocol / init / agent-tool-policy / bams-viz-emit / jojikdo)

## 3. Best Practice 작성 (≥50줄)
- [ ] `plugins/bams-plugin/references/best-practices/foo-bar.md` 작성
  - [ ] §1 호출 컨텍스트
  - [ ] §2 자주 발생하는 실수 3건
  - [ ] §3 권장 패턴
  - [ ] §4 체크리스트 5건
  - [ ] §5 참고

## 4. 부서 소속 확인
- [ ] `plugins/bams-plugin/agents/{department}-{leader}.md`의 부서 분배 표에 foo-bar 추가
- [ ] design-import 시나리오 사용 시 design-director SSOT 표에 추가 (F1~F9)

## 5. 검증
- [ ] `bash plugins/bams-plugin/scripts/validate-agent-sync.sh` 14/14 OK
- [ ] `bun test plugins/bams-plugin/tests/` PASS
- [ ] CI bun-test workflow PASS

## 6. Dogfooding (해당 시)
- [ ] `plugins/bams-plugin/tests/dogfooding/sample-guide.zip`에 호출 시나리오 추가
- [ ] `dogfooding.test.ts`로 1회 실행 확인

## 7. 문서/Commit
- [ ] CLAUDE.md는 자동 편집 대상이 아님 확인 (신규 에이전트 등록 시 조직도 갱신은 사용자 승인 하의 별도 프로세스 — §2 조직도 표는 사용자 확인 후에만 수정)
- [ ] commit 메시지: `feat(plugin): foo-bar specialist 등록`
- [ ] PR description에 본 체크리스트 결과 첨부

## 관련 SOP
- SSOT auto-sync: `plugins/bams-plugin/scripts/sync-specialists.ts`
- Cache 동기화: `plugins/bams-plugin/references/plugin-cache-sync.md`
- Best Practice 템플릿: `plugins/bams-plugin/references/best-practices/guide-decomposer.md` 참고
