# `_shared/` — Phase 로직 SSOT 디렉터리

> 이 디렉터리는 `/bams:dev`와 `/bams:feature`가 공유하는 **Phase 본문**(Pattern B — Delta 참조)을 담는다.
> `_shared_common.md`(전체 파이프라인 공통 규칙, Pattern A)와는 별개의 승격 계층이다.

---

## 왜 필요한가

`dev/phase-1-planning.md`·`feature/phase-1-planning.md`, `dev/phase-2-implementation.md`·`feature/phase-2-implementation.md`는
Step 1 전문과 Step 2-a/2-b(3개 Task tool 병렬 블록)가 **문자 단위로 100% 동일**했다. 두 파이프라인이 개별적으로
유지보수되면서 동일 로직이 두 곳에서 drift할 위험이 있었다 — 이를 막기 위해 공통 로직을 이 디렉터리로 승격한다.

## 규약 — Pattern B (Delta 참조)

**동일 로직이지만 step 번호·부가 스텝·모드 플래그가 커맨드마다 다를 때** 사용한다 (Pattern A "전체 참조"는 산문 수준 차이에만 적용 — `references/multi-perspective-review.md` 등 참조).

- Shared 파일(`_shared/*.md`)은 **canonical 알고리즘 + 명명된 확장점(Extension Point)**을 담는다.
- 커맨드별 stub(`dev/*.md`, `feature/*.md`)은 **Read 지시 + Delta 파라미터 표 + 커스터마이징 목록**만 담는다 (파일 경로·파일명은 절대 변경하지 않는다 — 엔트리포인트 라우팅 테이블이 이 경로를 그대로 가리킨다).

```
> 이 파일은 `{shared_path}`를 Read하여 그 지시를 따른다.
> 아래 Delta 파라미터로 `{PLACEHOLDER}`를 치환하고, 커스터마이징 섹션의 항목을 확장점에 반영한다.

## Delta 파라미터
| 파라미터 | 값 |
|----------|-----|
| `{PIPELINE_TYPE}` | dev |
| ... | ... |

## 커스터마이징 (Shared에서 이탈하는 부분)
- {확장점 이름}: {이 커맨드 고유 동작}
```

Shared 파일 쪽은 확장점을 눈에 띄는 헤더로 명시한다 (주석이 아니라 — LLM이 stub의 커스터마이징 항목을 놓치지 않도록):

```
### [확장점: STEP_2_EXTRA] — stub의 "커스터마이징" 표를 확인하고, 값이 있으면 이 위치에서 추가 실행한다. 값이 없으면 이 섹션을 건너뛴다.
```

## 실행 규약 (LLM 처리 절차)

1. stub 파일을 먼저 Read한다 (엔트리포인트 라우팅 테이블이 가리키는 파일 — 경로 불변).
2. stub 상단의 "이 파일은 `{shared_path}`를 Read하여 따른다" 지시에 따라 shared 파일을 Read한다.
3. shared 파일을 순서대로 실행하되, `{PLACEHOLDER}`는 stub의 Delta 파라미터 표 값으로 치환한다.
4. `[확장점: NAME]` 마커를 만나면 stub의 "커스터마이징" 목록에서 동일 이름 항목을 찾아 실행한다. 항목이 없으면 스킵한다.
5. shared 파일 실행이 끝나면 stub 파일 하단의 "Phase 완료 → 다음 라우팅" 문구로 복귀한다 (다음 파일 경로는 stub에 유지 — 라우팅 테이블 불변 원칙).

## 이 디렉터리의 파일

| 파일 | 역할 | 참조 stub |
|------|------|-----------|
| `phase-1-planning.md` | 기획(PRD + 기술 설계 + 태스크 분해 + 저장 + 핸드오프) canonical | `dev/phase-1-planning.md`, `feature/phase-1-planning.md` |
| `phase-2-implementation.md` | 구현(배치 실행 + design-director 연동 + 선택적 핸드오프) canonical | `dev/phase-2-implementation.md`, `feature/phase-2-implementation.md` |

## 신규 파일 추가 시

동일 Delta 참조가 필요한 Phase 로직이 늘어나면 이 디렉터리에 canonical 파일을 추가하고, 위 표에 등록한다.
stub은 파일명·경로를 유지한 채 "Read 지시 + Delta 표"만 남기는 전체 재작성(stub 구조)을 원칙으로 한다.
