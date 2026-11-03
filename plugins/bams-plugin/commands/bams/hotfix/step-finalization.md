# Hotfix: Finalization — 개선점 수집 + 마무리 회고

> 이 파일은 `/bams:hotfix`의 마무리 단계를 실행합니다.
> 공통 규칙은 `_common.md`를 참조합니다 (엔트리포인트에서 이미 로드됨).

## 입력 컨텍스트

- slug: {엔트리포인트에서 결정된 slug}
- parent_pipeline_slug: {Step 0.6에서 결정된 parent 슬러그 또는 null}
- triage_artifacts: `.crew/artifacts/hotfix/{slug}-triage.md`

---

## Step 4.5: 에이전트 개선점 수집 (2단 위임 — 루프 A)

> `_shared_common.md` §위임 원칙 + 부록 루프 A 준수. orchestrator는 조언자로만 호출하고, 메인이 직접 처리합니다. 본 Step은 실제 파일 생성만 수행하므로 orchestrator 조언 후 메인이 직접 처리합니다.

**Phase 1: Advisor 호출 (pipeline-orchestrator, 조언자 모드)**

서브에이전트 실행 (Task tool, subagent_type: **"bams-plugin:pipeline-orchestrator"**, **조언자 모드**):
<!-- load_profile:exempt non-department-lead spawn -->

> **조언자 요청** — 본 핫픽스의 근본 원인 에이전트 식별 및 개선점 기록 전략을 조언해 주세요. spawn 지시는 금지이며, Advisor Response 계약 형식(대상 에이전트/태스크 내역/주의사항/승인 조건)으로 반환합니다.
>
> **컨텍스트:**
> - triage: `.crew/artifacts/hotfix/{slug}-triage.md`
> - parent_pipeline_slug: {parent_slug or null}
> - 기존 학습: `.crew/memory/{agent}/MEMORY.md`
>
> **조언 필요 항목:**
> 1. 근본 원인 에이전트 후보 및 lesson-id(`{카테고리}:{태그}`) 추천
> 2. severity(minor/major/critical) 판정
> 3. 같은 lesson-id 기존 항목 유무와 승격 게이트 충족 여부

**Phase 2: 메인이 직접 실행** (규약: `references/agent-improvement-protocol.md` §1~§5)

1. triage.md Read → 근본 원인 에이전트·lesson-id·severity 확정. minor면 기록 생략
2. `.crew/memory/{agent}/MEMORY.md`에 사용자 확인 후 반영 — 같은 lesson-id가 있으면 seen+1(다른 pipeline-slug일 때만)·`last`·evidence 갱신, 없으면 새 항목(`references/agent-memory.md` 형식, conf low·seen 1)
3. critical이면 `.crew/gotchas.md` 후보로 사용자에게 제안
4. 갱신 결과 §5 승격 게이트(seen ≥3·conf high·다중 프로젝트 재현) 충족 시에만 AskUserQuestion → Yes면 §5 개선안 작성 후 hr-agent spawn으로 적용

---

## 마무리: 자동 회고 (축소판, 2단 위임 — 루프 A 직접 호출)

> `_shared_common.md` §부록 루프 A 준수. Step 4.5 Phase 1의 Advisor 조언을 기반으로 메인이 근본 원인 부서장을 직접 spawn합니다.

**메인이 직접 부서장 spawn + 학습 기록**

Step 4.5 Phase 1의 Advisor Response에서 근본 원인 부서장 정보를 활용하여, 메인이 다음을 수행합니다:

1. Task tool로 **근본 원인 부서장(동적) 호출**: Step 4.5 Phase 1에서 식별된 부서장에게 자기 부서 관점 교훈 1~3줄 기록 위임 (KPT 정성)
2. 메인이 직접 아래 학습 카테고리를 tracking/Learnings에 기록:
   - `hotfix:` — 근본 원인 + 영향 범위 요약
   - `vulnerable:` — 같은 영역 반복 버그 감지 시 경고 수준 상향
   - `regression-test:` — 추가 회귀 테스트 경로
3. 메인이 직접 관련 태스크를 Done 처리하고 `.crew/board-archive.md`의 `## Done ({slug} — YYYY-MM-DD)` 섹션으로 이관(형식 그대로) — `completion-protocol.md` Step 4.6

---

## 파이프라인 완료 (history.md 기록)

파이프라인 완료 시, 메인이 `.crew/history.md`에 1줄 기록을 추가합니다 (완료 판별 기준 = history.md 기록 유무, 기존 형식):

```
## {YYYY-MM-DD} | {slug} | {COMPLETED|FAILED}
- type: hotfix
- status: {completed|failed}
- 산출물: triage 리포트, 수정 코드, 회귀 테스트
- 요약: {한 줄 요약}
- parent: {parent_pipeline_slug or null}
```

`.crew/board.md` 업데이트: 관련 태스크 있으면 Done 처리 후 `.crew/board-archive.md`로 이관(Step 4.6 아카이브 규칙).

**`references/completion-protocol.md` 참조.** 표준 프로토콜을 따릅니다.

이 파이프라인의 Learnings 카테고리:
1. `hotfix:` — 근본 원인 + 영향 범위
2. `vulnerable:` — 같은 영역 반복 버그 시 경고 수준 상향
3. `regression-test:` — 추가된 회귀 테스트 경로

## 회고 연결

마무리 후 `references/completion-protocol.md` Step 4.95에 따라 `/bams:retro {slug}` 실행 여부를 AskUserQuestion으로 확인한다 (CLAUDE.md §5 회고 의무). hotfix 내장 '개선점 수집'(Step 4.5)은 KPT 회고를 대체하지 않는다.
