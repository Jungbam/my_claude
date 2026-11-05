# 입력 라우터 (prompt router) — 메인 행동 규약 [L2]

> 온디맨드 문서. 메인 컨텍스트에 `[bams router]` 줄이 주입됐을 때만 Read한다.
> 구성: `hooks/prompt-router.sh`(UserPromptSubmit, 결정적 매칭 — LLM 호출 없음) + SSOT `references/route-table.json` + 메인 최종 판단.

## 1. 동작

- 슬래시 없는 입력을 route-table 패턴과 대조해 최고 점수 라우트와 신뢰도(high/med)를 컨텍스트에 주입한다. 매칭이 없으면 아무것도 출력하지 않는다.
- 건너뜀: `/`로 시작하는 입력, 빈·짧은 응답형 입력(응/네/ok/진행해/1 등), `<task-notification>`·`<system-reminder>`·다른 세션 메시지, 붙여넣기 블록 내부(분류 근거에서 제외).
- 주입 형식: `[bams router] 후보: /bams:hotfix (high, 근거: "...") | 체인: /bams:init → /bams:hotfix | 모드: auto` + 행동 규칙 1~2줄.
- hook은 프롬프트를 바꾸지 못한다. 실행 여부는 항상 메인이 판단한다.

## 2. 모드 (`BAMS_ROUTER` 환경변수)

| 값 | 동작 |
|----|------|
| `auto` (기본) | 신뢰도별 행동(§3)대로 실행까지 진행 |
| `suggest` | 실행하지 않고 후보만 추천 |
| `off` | hook이 아무것도 출력하지 않음 |

## 3. 신뢰도별 메인 행동

| 신뢰도 | 행동 |
|--------|------|
| high | 한 줄 고지("`/bams:hotfix`로 진행합니다") 후 Skill tool로 실행 |
| med | 후보 2~3개를 제시하고 선택 질문(AskUserQuestion) |
| low/없음 | 라우팅 없이 일반 응답 |

- 진행 중인 파이프라인의 답변·후속 지시로 보이면 router 줄을 무시한다(high여도 동일).
- 주입된 후보가 문맥상 명백히 틀리면 실행하지 않고 일반 응답한다.

## 4. init 체인

- `needs_crew: true` 라우트(파이프라인)인데 프로젝트에 `.crew/config.md`가 없으면 hook이 체인 앞에 `/bams:init`을 붙인다.
- 메인은 `/bams:init` 완료 후 원래 커맨드를 이어서 실행한다. 스킬·질문(`/bams:q`) 라우트는 init이 필요 없다.
- 체인 라우트(예: "계획 세우고 구현까지" → `/bams:plan` → `/bams:dev`)는 각 단계 완료 후 다음 단계로 넘어간다.

## 5. 오판 시 대처

- 사용자가 "아니"·"그거 말고" 등으로 거부하면 즉시 중단하고 일반 응답으로 처리한다. 같은 입력을 재라우팅하지 않는다.
- 반복 오판 패턴은 route-table의 `negative` 패턴 추가로 고친다(§6).
- 일시 해제는 `BAMS_ROUTER=off`, 추천만 받으려면 `BAMS_ROUTER=suggest`.

## 6. route-table 수정 방법

- 항목: `id`, `target`(`/bams:X` 또는 스킬명), `kind`(pipeline|skill|question), `needs_crew`, `patterns.high`/`patterns.med`(정규식), `negative`, `chain`, `note`. 필드 정의는 `route-table.json`이 SSOT다.
- 한국어·영어 패턴을 함께 넣고, high는 오탐이 거의 없는 구체 표현만 둔다.
- 수정 후 `bash scripts/validate-harness.sh`(JSON 유효성·target 실재·정규식 컴파일)와 `bash tests/hooks/run-hook-tests.sh`(대표 입력 회귀)를 실행한다.
- 신규 `/bams:` 커맨드·스킬을 추가하면 route-table 등재 여부를 함께 판단한다(허브 커맨드는 제외 가능).
