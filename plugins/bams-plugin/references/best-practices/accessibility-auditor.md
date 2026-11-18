# Best Practice: accessibility-auditor

| 블록 | 트리거 | 라인범위 |
|------|--------|----------|
| 1. 호출 컨텍스트 | 트리거·입출력·부서장·모델 확인 | L11-22 |
| 2. 자주 발생하는 실수 3건 | 반복 실수·회피책 참조 | L24-39 |
| 3. 권장 패턴 | axe 실행·색상 대비·핸드오프 패턴 | L41-53 |
| 4. 체크리스트 (필수) | 착수 전 필수 점검 | L55-60 |
| 5. 참고 | 출처·협업 링크 | L62-66 |

## 1. 호출 컨텍스트
- **트리거**: design-import 파이프라인의 Phase D에서 design-director가 위임. F5 visual-fidelity-verifier와 병렬 실행 가능.
- **입력**:
  - `target_url: "http://localhost:3000/{path}"` — 구현 페이지 URL (localhost 전용)
  - (선택) `.crew/artifacts/design/{slug}/fidelity/verdict.json` — F5 결과 참조
  - WCAG 기준 레벨: 2.2 AA (디폴트)
- **출력**:
  - `a11y/a11y.json` (audit-a11y 결과 — axe 원본은 `results[].axe` 필드) + `ui-computed.json`·`ui-static.json`
  - `a11y/accessibility-report.md` (우선순위화된 위반 + 권고)
  - `a11y/a11y-verdict.json` (PASS/CONDITIONAL/FAIL + 위반 수)
- **부서장**: design-director
- **모델**: claude-sonnet-5-5 컨트롤러(frontmatter) + 본문 codex 위임 gpt-6.1-sol(MCP 1차 / CLI fallback)

## 2. 자주 발생하는 실수 3건

### 실수 1: Preflight 없이 axe-core 실행 → 빈 결과
- **증상**: `a11y.json`에 axe 위반이 없어 PASS 오판. 실제로는 dev 서버 미기동 — 행은 `results[].error`(또는 HTTP 4xx/5xx면 `skipped`)뿐이고 `axe` 필드가 없다.
- **원인**: `curl {target_url}` Preflight 없이 바로 axe 실행.
- **회피**: 반드시 target_url Preflight: `curl -s -o /dev/null -w "%{http_code}" {target_url}` — 200 아니면 dev 서버 미기동으로 판단하고 platform-devops 에스컬레이션.

### 실수 2: SR-3 위반 — 외부 URL 감사 시도
- **증상**: `target_url`이 `https://staging.example.com/...` 형태로 설정된 채 axe 실행. 보안 정책 위반 + 결과 신뢰성 없음.
- **원인**: 위임 메시지에서 staging/production URL을 그대로 수신하여 SR-3 검사 없이 사용.
- **회피**: `target_url`이 `http://localhost` 패턴인지 Bash grep 검사 먼저. 외부 URL이면 `[ERROR] SR-3: 외부 URL 거부` 출력 후 design-director 승인 요청. 승인 없이 실행 금지.

### 실수 3: 판정 기준을 자체 규칙으로 하향·혼동
- **증상**: a11y-verdict.json이 `"verdict": "CONDITIONAL"`인데 확인된 P0 위반 존재, 또는 axe 미실행을 PASS로 처리. frontend-engineering이 P1 이상 수정 없이 배포.
- **원인**: 에이전트 본문에 판정 숫자를 따로 두고 SSOT와 어긋남.
- **회피**: 판정은 `references/issue-severity.md` §QA 판정 매핑 + §파이프라인별 Override `qa --audit` 행만 따른다(숫자 재기재 금지). axe impact → P 변환은 `skills/qa-audit/references/a11y-audit.md` A1. axe 미발견은 `unverified`(실패 아님 — PASS도 아님, 핵심 경로면 매핑 규칙 (a)). 자동 검사 위반 0 ≠ 준수 — 키보드 흐름 수동 확인.

## 3. 권장 패턴

- **패턴 A — axe-core 실행 + codex 분석 분리**:
  ```bash
  # 1단계: doctor → axe 실행 (bams QA 감사 스크립트, S="$_BAMS/skills/qa-audit/scripts" — 에이전트 본문 리졸버)
  node "$S/doctor.mjs" --out "$OUT"   # axe 출처(source·version) 또는 unverified 사유 — JSON은 stdout, 파일은 doctor.md만
  node "$S/audit-a11y.mjs" --base http://localhost:3000 --routes /target --out "$OUT" --server dev
  # 2단계: codex에 분류 위임 (입력은 a11y.json — axe 필드 포함)
  run_codex "다음 a11y.json 후보를 P0~P2 우선순위로 분류하고 수정 방법을 한국어로 작성: $(cat "${OUT}a11y.json")"
  # 3단계: Claude가 검증 후 accessibility-report.md 작성
  ```
- **패턴 B — 색상 대비 검사 분리**: `contrast_check`는 axe-core가 놓치는 케이스(배경 이미지, opacity 중첩)가 있으므로 `inspect-computed-style.mjs`(계산된 스타일 대비·터치 대상)로 보완하고, 남는 경우는 스크린샷으로 확인.
- **패턴 C — frontend-engineering 핸드오프 포맷**: accessibility-report.md P0/P1 섹션에 "수정 코드 예시" 포함 필수. 디자이너용 권고(색상 변경)와 개발자용 권고(ARIA 추가, role 수정)를 명확히 분리.

## 4. 체크리스트 (필수)
- [ ] Preflight: target_url 응답 200 확인 후 axe 실행
- [ ] doctor 확인 → axe 출처(source·version) 또는 `unverified` 사유를 리포트에 기록
- [ ] SR-3: target_url이 localhost 패턴인지 grep 검사 완료
- [ ] 판정: §QA 판정 매핑 + `qa --audit` 행 준수, 키보드 흐름 수동 확인 완료
- [ ] a11y-verdict.json `"via": "gpt-6.1-sol (codex MCP)"` 필드 포함(CLI fallback 시 `gpt-6.1-sol (codex CLI(fallback))`)

## 5. 참고
- 부모 deep-review: deep-review_designimport품질진단_20260630
- 후속 hotfix: PR #14 (Critical) + PR #15 (Major)
- 본 plan: plan_designimport정밀화 (F-R-A1)
- 협업: F5 visual-fidelity-verifier (병렬), frontend-engineering (P0/P1 위반 수정), ux-designer (ARIA/키보드 개선안)
