# 파이프라인 구조개편 마이그레이션 가이드

- **plan**: `plan_파이프라인구조개편` (P2 10건, 2026-07-02 ~ 2026-07-03)
- **PRD**: `.crew/artifacts/prd/plan_파이프라인구조개편-prd.md` (v2 APPROVED)
- **spec**: `.crew/artifacts/design/plan_파이프라인구조개편-spec.md` (Phase 2 통합본)
- **원칙**: 사용자 워크플로 breaking change **0건** — 커맨드 이름 유지, 사용법 동일

---

## 1. 구조개편 요약 (F-R1 ~ F-R10)

- **F-R1** — dev/feature `Phase 1/2` 로직 → `commands/bams/_shared/phase-{1,2}-*.md` 승격 (Pattern B / Delta 참조). dev/feature 각 phase 파일은 Delta 파라미터 + 커스터마이징 stub (35~49줄) 로 축약.
- **F-R2** — review/deep-review 5관점 리뷰 본문 → `references/multi-perspective-review.md`(61줄) SSOT. review.md/deep-review.md는 링크로 대체.
- **F-R3** — README/CLAUDE.md 최상단에 **4행 진입점 매트릭스** 도입 (신규 커맨드 없음). 6개 커맨드 description 정합화.
- **F-R4** — 부서 허브 4개(engineering/planning/evaluation/qc) 공통 로직 → `references/dept-hub-protocol.md`(62줄) 승격. 4개 hub 파일 각 19줄로 축약.
- **F-R5** — preflight `git pull`/사전 조건 → `references/preflight-protocol.md` 배치 0 신설. dev/feature/debug/plan/review/sprint 6개 커맨드가 링크로 참조.
- **F-R6** — `pipeline_end.duration_ms` 실측 표준화. `hooks/bams-viz-emit.sh`에 `now_ms` 서브커맨드 추가(perl→python3→GNU date→BSD 폴백 체인), `duration_ms_measured` boolean 필드 추가. `references/viz-agent-protocol.md`에 스니펫 라이브러리.
- **F-R7** — GO/CONDITIONAL/FAIL 임계값 → `references/issue-severity.md` §Release Gate 임계값 승격. 파이프라인별 override 표(hotfix Major ≤1, deploy Major ≤0) + Reverse Index.
- **F-R8** — 회고 트리거를 debug/review/deep-review/verify/sprint 5개 커맨드로 확장. `references/completion-protocol.md` Step 4.95에 스팸 방지 조건(10분 미만 + 변경 0줄/경량) + `retro_skip(mode=C)` 자동 emit.
- **F-R9** — `--minimal` 경량 경로 도입. dev/feature/hotfix에 플래그 인식 + `git diff --stat` 규모 자동 감지. `references/lightweight-path-protocol.md`(113줄) SSOT.
- **F-R10** — WU 선택 프롬프트 제거. 활성 WU 2개+ 시 최근 사용 WU 자동 연결(`pipeline_linked` 우선, `work_unit_start` 폴백). `server/src/app.ts` `/api/workunits/active`에 `lastLinkedAt` 필드 추가.

---

## 2. 신규 SSOT 파일 6개

| 경로 | 라인 | 역할 |
|------|------|------|
| `commands/bams/_shared/README.md` | 59 | Pattern A/B 참조 규약 + LLM 실행 절차 5단계 명문화 |
| `commands/bams/_shared/phase-1-planning.md` | 312 | dev/feature Phase 1(PRD+설계+분해) canonical 알고리즘 + 확장점 |
| `commands/bams/_shared/phase-2-implementation.md` | 239 | dev/feature Phase 2(배치 실행) canonical + `DESIGN_DIRECTOR_MODE` 확장점 |
| `references/multi-perspective-review.md` | 61 | 5관점(정확성/보안/성능/코드 품질/테스트) 정의 + review vs deep-review 역할 구분 |
| `references/dept-hub-protocol.md` | 62 | 부서 허브 5단계 실행 흐름 + viz 계측(pipeline_start/step_start) 표준 |
| `references/lightweight-path-protocol.md` | 113 | `--minimal` 축약 규칙 + 자동 규모 감지 + 세션 내 재제안 방지 |

---

## 3. 참조 규약 (Pattern A / Pattern B)

`commands/bams/_shared/README.md` 정본. 요약:

- **Pattern A — 전체 참조**: 커맨드별 차이가 없거나 산문 수준 미세 차이. 형식 `**{shared_path} 참조.** 표준 프로토콜을 따릅니다. / 차이점: 없음 | 항목 열거`. 적용: preflight-protocol / multi-perspective-review / dept-hub-protocol / issue-severity §Release Gate / lightweight-path-protocol.
- **Pattern B — Delta 참조**: 동일 로직이나 step 번호·모드·확장점이 다름. Shared는 canonical + `[확장점: NAME]` 마커, stub은 `Read 지시 + Delta 파라미터 표 + 커스터마이징 목록`. 적용: `_shared/phase-{1,2}-*.md` (dev/feature).
- **실행 절차 5단**: stub Read → shared Read → PLACEHOLDER 치환 → `[확장점: NAME]` 마커에서 stub 커스터마이징 실행(없으면 스킵) → stub 하단 "다음 라우팅" 복귀.

---

## 4. 기존 사용자 영향

**Breaking change 0건**:
- 커맨드 이름 100% 유지 (신규 0, rename 0, 삭제 0)
- 사용법 동일 — `/bams:dev`, `/bams:feature`, `/bams:review`, `/bams:deep-review`, `/bams:engineering` 등 그대로
- viz 이벤트 스키마 breaking change 0 (`duration_ms_measured`는 optional 신규 필드)

**달라진 점 (사용자가 체감할 3가지)**:

1. **WU 자동 연결** — 활성 Work Unit이 2개 이상일 때 더 이상 선택 프롬프트가 뜨지 않는다. 최근 사용 WU(마지막 `pipeline_linked` 기준)에 자동 연결되며, 콘솔에 `[WU 자동 연결] '...'에 연결됨` 로그가 출력된다. 다른 WU에 연결하려면 `--wu <slug>` 플래그 사용.
2. **`--minimal` 경량 경로** — dev/feature/hotfix에 `--minimal` 플래그 추가. +1~+30줄 규모 변경 시 자동 감지되어 축약 경로가 제안된다(파이프라인당 최대 1회, 세션 내 재제안 없음). 축약: orchestrator Advisor 스킵 + 검증 최소셋(build+lint) + 회고 1줄 노트.
3. **진입점 매트릭스** — README/CLAUDE.md 최상단에 "5초 결정표"(4행: 버그 수정/신규 기능/코드 리뷰/계획 수립) 배치. 커맨드 이름을 외우지 않아도 매트릭스만 훑으면 즉시 진입 가능.

---

## 5. 문제 발생 시 롤백 (F-R별 커밋 단위 revert)

본 plan은 단일 PR + F-R별 다중 커밋(10개)으로 구성. 각 F-R 커밋은 독립적으로 `git revert <sha>` 가능하도록 설계되었다.

| F-R | 커밋 성격 | 단독 revert 가능성 |
|-----|----------|-------------------|
| F-R5 | preflight 링크 이관 | ✓ 완전 독립 |
| F-R6 | 인프라(`bams-viz-emit.sh`+스키마+41개 커맨드 스니펫) | ✓ 인프라 파일 3개는 통째로, 41개 커맨드는 부분 revert 가능 |
| F-R1 | `_shared/` 3파일 + 4개 stub | ⚠ 그룹 단위 revert 필수 (단독 revert 시 stub이 깨짐) |
| F-R2 | `multi-perspective-review.md` + review/deep-review 링크 | ✓ 완전 독립 |
| F-R4 | `dept-hub-protocol.md` + 4개 hub | ⚠ 그룹 단위 revert 필수 |
| F-R7 | `issue-severity.md` + 9개 참조 커맨드 | ✓ 완전 독립 |
| F-R8 | `completion-protocol.md` Step 4.95 + 5개 커맨드 회고 연결 | ✓ 완전 독립 (F-R6 선행 의존은 인프라 필드만) |
| F-R3 | README/CLAUDE.md 매트릭스 + 6개 desc | ✓ 완전 독립 |
| F-R9 | `lightweight-path-protocol.md` + 3커맨드 훅 | ✓ 완전 독립 |
| F-R10 | `server/src/app.ts` + `_shared_common.md` + CLAUDE.md §WU | ✓ 완전 독립 |

**긴급 롤백 순서**: (a) 문제 있는 F-R 커밋 sha 식별 → (b) `git revert <sha>` → (c) 회귀 dogfooding 1회 → (d) 해당 회고 사이클에서 근본 원인 분석 후 재시도.

**전체 롤백**이 필요할 경우 PR 자체를 `git revert -m 1 <merge-sha>`로 되돌린다 (단일 PR 원칙이 이 시나리오를 허용).
