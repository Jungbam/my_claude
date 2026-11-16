# Gotchas 관리 명세

## 구조

```
CLAUDE.md              → ## Gotchas (상위 5개, 항상 Claude 컨텍스트에 노출)
.crew/gotchas.md       → 전체 목록 (히스토리 + 상세 + 카테고리)
```

## .crew/gotchas.md 형식

```markdown
---
last_updated: [ISO timestamp]
total: [N]
---

# Gotchas

## ⚠ 반드시 확인 (Critical)
반복적으로 문제를 일으키는 핵심 함정. 코드 작성/리뷰 시 항상 확인.

- **[ID]** `[파일/영역]` — [설명] ([발생 횟수]회, 최근: [날짜]) · enforced-by: [수준]

## 🔧 환경/설정 (Environment)
로컬/CI/배포 환경에서 빠지기 쉬운 함정.

- **[ID]** [설명] (발견: [날짜]) · enforced-by: [수준]

## 📦 의존성 (Dependencies)
패키지 버전, 호환성, 보안 관련 주의사항.

- **[ID]** `[패키지]` — [설명] (발견: [날짜]) · enforced-by: [수준]

## 🧩 패턴/컨벤션 (Patterns)
이 프로젝트에서 반드시 따라야 하는 패턴. 어기면 버그 발생.

- **[ID]** [설명] (확립: [날짜]) · enforced-by: [수준]

## 🔒 규칙 ↔ 강제
| ID | 규칙 | enforced-by | 강제 위치 | 증명 | 등록 후 재발 |
|----|------|-------------|-----------|------|--------------|
| G-001 | SQL은 파라미터 바인딩만 | hook/lint/CI | `.eslintrc` no-raw-sql | 사고 커밋에서 lint 실패 확인 | 0 |
| G-003 | 결제 금액은 서버 재계산 | doc | — | — | 1 → 승격 후보 |

## 📋 이력
| ID | 추가일 | 출처 | 상태 |
|----|--------|------|------|
| G-001 | 2026-03-25 | hotfix/null-crash | enforced |
| G-002 | 2026-03-20 | security-audit | resolved (2026-03-22) |
```

## enforced-by 필드

모든 gotcha에 붙인다. 값은 `retro-protocol.md` §3-1-a 사다리(architecture | type | hook/lint/CI | test | doc). 신규 gotcha 기본값은 `doc`이다. `doc` 외 값은 강제 위치(파일·명령)와 증명(과거 사고에 적용해 실패함)이 §규칙 ↔ 강제 표에 있어야 한다. 없으면 `doc`으로 본다.

## ID 체계

`G-NNN` 형식. .crew/gotchas.md의 이력 테이블에서 가장 높은 번호 + 1.

## CLAUDE.md 형식

```markdown
## Gotchas
<!-- 자동 관리: pipeline이 .crew/gotchas.md에서 상위 5개를 동기화합니다 -->
- ⚠ `src/lib/db.ts` — SQL 직접 작성 시 반드시 파라미터 바인딩 (3회 핫픽스)
- 🔧 `npm install` 후 `@ezar/grpc` 버전 확인 — private registry 캐시 이슈
- 📦 lodash < 4.17.21 → CVE-2021-23337
- 🧩 API Route 에러 핸들링 → try-catch + NextResponse.json 패턴 필수
- ⚠ Docker mysql healthy 체크 없이 서버 기동 시 connection refused
```

## 심각도 분류

이슈 심각도 분류 기준은 `references/issue-severity.md`를 참조합니다.
심각도에 따라 승격 우선순위와 대응 긴급도가 달라집니다.

## 자동 승격 규칙

Pipeline Learnings → Gotchas 승격 조건:

| 조건 | 승격 방법 |
|------|-----------|
| 같은 영역/파일에 **3회 이상** 이슈 발생 | 자동 제안 (AskUserQuestion) |
| hotfix 근본 원인이 **패턴 실수** | 자동 제안 |
| 보안 감사에서 **Critical** 발견 | 자동 제안 (사용자 확인) |
| 사용자가 "기억해" / "gotcha" 언급 | 즉시 추가 |

## 구조 승격 (doc → hook)

텍스트 gotcha는 읽지 않으면 아무것도 막지 못한다. 회고(`retro-protocol.md` §3-1-b)가 `enforced-by: doc` 항목을 자동 플래그한다.

| 조건 | 조치 |
|------|------|
| 발생 횟수 ≥3 | hook 승격 후보 — 강제 수준 ≥3 Try 제안 |
| 등록 후 재발 ≥1 (같은 class 2회째) | hook 승격 후보 — 규칙이 이미 있었으므로 같은 변경에서 가장 높은 수준으로 고친다 |
| 구조 적용 + 증명 통과 | `enforced-by` 갱신, 상태 `enforced`, 같은 교훈의 MEMORY.md·Pipeline Learnings 항목 삭제 |
| architecture로 실수 자체가 불가능해짐 | `resolved` — 규칙 표에서도 제거 |

## 자동 강등/제거 규칙

| 조건 | 조치 |
|------|------|
| 해당 영역이 리팩토링으로 **제거됨** | `resolved` 처리 + CLAUDE.md에서 제거 |
| 구조로 강제됨 (`enforced`) | CLAUDE.md 상위 5개에서 제외 — 도구가 막으므로 컨텍스트 노출 불필요 |
| 의존성이 **업그레이드됨** | `resolved` 처리 |
| 6개월간 관련 이슈 **없음** | 강등 후보로 제안 |

## CLAUDE.md ↔ .crew/gotchas.md 동기화

**CLAUDE.md에 올라가는 기준** (상위 5개 선정):
1. Critical 카테고리 먼저
2. 같은 카테고리 내에서는 발생 횟수 높은 순
3. 같은 횟수면 최근 발생일이 가까운 순
4. resolved·enforced 상태는 제외 (`enforced-by: doc`인 active 항목만 대상)
