# 공통 규칙 (모든 파이프라인 공유)

> 모든 `/bams:*` 파이프라인의 `_common.md`가 이 파일을 Read한다. `[bams router]` 컨텍스트 처리: `references/prompt-routing.md` [L2]

---

## ★ 위임 원칙 — 2단 위임 + Orchestrator 조언자 모드 (Canonical)

모든 코드 수정은 `커맨드(메인) → 부서장 → (선택적) specialist` 2단 위임으로 한다. harness가 중첩 spawn을 막으므로 pipeline-orchestrator는 계획·게이트·라우팅만 반환하는 조언자다. 상세: `references/delegation-protocol.md`.

- 허용: Bash/Glob/Grep/Read 상태 확인, AskUserQuestion, orchestrator 조언 호출, 메인의 부서장 직접 spawn(병렬은 단일 메시지). 부서장은 specialist를 최대 1회 spawn.
- 금지: 메인의 소스 코드 Edit/Write, 서브에이전트 내부 중첩 spawn, "직접 하면 더 빠르다"는 이유의 위임 생략.
- 조언 생략: 참여 부서장·라우팅이 history·파일 패턴으로 결정적이면 orchestrator 조언 호출을 생략할 수 있고 생략 사실을 history에 남긴다. Phase 게이트 Go/No-Go 판정은 생략하지 않는다.
- **CHAIN_VIOLATION**: orchestrator 응답 상단에 이 경고가 있거나 메인이 위임을 건너뛴 정황이면 해당 Phase를 즉시 중단하고 에스컬레이션한다(재시도 금지).

### 부서장 spawn·보고 처리 (계약 SSOT: `delegation-protocol.md` §2-2·§2-5·§2-6)

- spawn 프롬프트에 이전 Phase 요약을 붙이지 않는다 — 산출물 **경로**와 보고 파일 경로만 넘긴다.
- 부서장은 `status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED` + 변경 파일 + 검증 명령·결과 한 줄 + 우려사항 + 보고 파일 경로만 반환한다.
- 메인은 보고를 **미검증 주장**으로 취급한다: 게이트 전에 `git diff --stat`과 검증 명령 출력으로 직접 확인한다.

### load_profile 발행 규칙 (기본 프로파일 · SSOT-b)

스키마 원문은 `references/delegation-protocol.md §2-2-a`.

- **기본 프로파일** (exempt 마커가 상속하는 값): `load_profile: { level: L2, refs: [{doc: best-practices}, {doc: agent-rules}] }`
- **모든 부서장 spawn 블록은 인라인 `> load_profile: {값}` 또는 감사 가능한 exempt 마커 중 정확히 하나를 보유한다.** 둘 다 없으면 silent underload(FAIL).
- **heavy-lead(design-director·product-strategy) 블록은 값 주입 필수** — exempt 마커 금지.
- 그 외 부서장 블록은 `<!-- load_profile:exempt inherits _shared_common §위임 원칙 -->`로 기본 프로파일을 상속할 수 있다. 비-부서장(조언자/specialist) spawn은 `<!-- load_profile:exempt non-department-lead spawn -->`.

---

## ★ 파이프라인 완료 기록 (상태 판별의 SSOT)

파이프라인 상태(진행 중/완료/실패)의 단일 진실 소스는 `.crew/history.md`다 — 완료 기록이 있으면 완료, 없으면 진행 중. 마무리 시 아래 블록을 append한다:

```
## YYYY-MM-DD | {slug} | {STATUS}
- type: {command}
- status: {완료|실패|중단}
- 산출물: {산출물 경로 목록 또는 없음}
- 요약: {한 줄 요약}
```

- 태스크 상태는 `.crew/board.md`, 파이프라인 이력은 `.crew/history.md`로 이원화한다.
- **board.md 아카이브**: Done 태스크는 `.crew/board-archive.md`로 이관한다 — `references/completion-protocol.md` Step 4.6.
- 회고 입력은 history.md + 대상 산출물 + 사용자 관찰뿐이다.

---

## 스킬 로딩

```bash
_BROWSE_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/browse/SKILL.md" 2>/dev/null | head -1)
_QA_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/qa-only/SKILL.md" 2>/dev/null | head -1)
_BENCHMARK_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/benchmark/SKILL.md" 2>/dev/null | head -1)
_CSO_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/cso/SKILL.md" 2>/dev/null | head -1)
_SHIP_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/ship/SKILL.md" 2>/dev/null | head -1)
_DEPLOY_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/land-and-deploy/SKILL.md" 2>/dev/null | head -1)
_DOCRELEASE_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/document-release/SKILL.md" 2>/dev/null | head -1)
_RETRO_SKILL=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/skills/retro/SKILL.md" 2>/dev/null | head -1)
```

`_BROWSE_SKILL`이 비어 있으면 스킬 미설치로 보고 해당 단계를 대체 행동으로 처리한다.

---

## ★ dev-hotfix 모드 (멀티이슈 배치 수정)

`/bams:hotfix`에서 4건 이상 이슈로 dev 전환됐거나(preflight Step 0.55 "배치 dev"), `/bams:dev`에 멀티이슈 목록이 들어온 경우.

- 라우팅: `dev/phase-0-init.md` → `dev/mode-hotfix-init.md`(Phase 0.8~0.95, 이슈 파싱·배치 분할) → Phase 1(기획) 생략 → `dev/phase-1-5-git.md` → `dev/phase-2-implementation.md`(배치별 순차) → Phase 2.5~4 기존 흐름.
- 배치 검증: 배치마다 `bun run build && bun run typecheck`, 실패 시 그 배치만 롤백. 전체 완료 후 Phase 2.5 풀 테스트.
- 네이밍: slug `dev_{요약}`, pipeline_type `dev-hotfix`, 배치 계획 `.crew/artifacts/report/{slug}-batch-plan.md`.
- context rot 방지: 배치당 최대 4건. 5배치 이상이면 배치 3 완료 후 `/compact` 제안(completion-protocol Step 4.9).

---

## 부록: 표준 2단 오케스트레이션 루프

- **루프 A — Simple** (단일 도메인·낮은 복잡도): orchestrator 생략 → 부서장 1회 직접 spawn → 보고 검증(§위임 원칙).
- **루프 B — Advised** (다부서·Phase 게이트): orchestrator 1회 조언 → CHAIN_VIOLATION 확인 → 권고 부서장 병렬 spawn(단일 메시지) → 보고 검증 후 게이트 판정.

---

## Commit 분리 정책

squash 머지 PR은 머지 전 카테고리별 commit으로 나누고 PR description에 boundary를 남긴다.

```
## Commit Map (squash 시 boundary)
- C1 (Category A): {핵심 변경 요약}
- C2 (Category B): ...
```

각 commit footer에 `Revert-Safe: yes | partial | no` — yes: 단독 revert 무회귀 / partial: 다른 commit과 함께 revert / no: revert 시 main 깨짐.
