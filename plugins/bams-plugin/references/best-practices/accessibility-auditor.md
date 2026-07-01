# Best Practice: accessibility-auditor

## 1. 호출 컨텍스트
- **트리거**: design-import 파이프라인의 Phase D에서 design-director가 위임. F5 visual-fidelity-verifier와 병렬 실행 가능.
- **입력**:
  - `target_url: "http://localhost:3000/{path}"` — 구현 페이지 URL (localhost 전용)
  - (선택) `.crew/artifacts/design/{slug}/fidelity/verdict.json` — F5 결과 참조
  - WCAG 기준 레벨: 2.2 AA (디폴트)
- **출력**:
  - `a11y/axe-results.json` (axe-core 원본 결과)
  - `a11y/accessibility-report.md` (우선순위화된 위반 + 권고)
  - `a11y/a11y-verdict.json` (PASS/CONDITIONAL/FAIL + 위반 수)
- **부서장**: design-director
- **모델**: gpt-5-codex (codex CLI 위임) + sonnet controller

## 2. 자주 발생하는 실수 3건

### 실수 1: Preflight 없이 axe-core 실행 → 빈 결과
- **증상**: `axe-results.json`이 `{"violations":[]}`로 생성되어 PASS 오판. 실제로는 dev 서버 미기동 상태.
- **원인**: `curl localhost:3099/api/agents/data` 및 `curl {target_url}` Preflight 없이 바로 axe 실행.
- **회피**: 반드시 2단계 Preflight: (1) sidecar 상태 `curl localhost:3099/api/agents/data` — 404면 `build-sidecar.sh` 재빌드 요청, (2) target_url `curl -s -o /dev/null -w "%{http_code}" {target_url}` — 200 아니면 platform-devops 에스컬레이션.

### 실수 2: SR-3 위반 — 외부 URL 감사 시도
- **증상**: `target_url`이 `https://staging.example.com/...` 형태로 설정된 채 axe 실행. 보안 정책 위반 + 결과 신뢰성 없음.
- **원인**: 위임 메시지에서 staging/production URL을 그대로 수신하여 SR-3 검사 없이 사용.
- **회피**: `target_url`이 `http://localhost` 패턴인지 Bash grep 검사 먼저. 외부 URL이면 `[ERROR] SR-3: 외부 URL 거부` 출력 후 design-director 승인 요청. 승인 없이 실행 금지.

### 실수 3: critical/serious 위반을 CONDITIONAL로 하향 처리
- **증상**: a11y-verdict.json이 `"verdict": "CONDITIONAL"`인데 실제로 critical 위반 2건 존재. frontend-engineering이 P1 이상 수정 없이 배포.
- **원인**: 판정 기준 혼동 — critical > 0이면 FAIL이 맞으나 CONDITIONAL 처리.
- **회피**: 판정 로직 명시: `critical > 0 → FAIL`, `serious > 0 → FAIL`, `moderate/minor만 → CONDITIONAL`, `전체 0건 → PASS`. axe-core `impact` 필드 기준: `critical`=P0, `serious`=P1, `moderate`=P2, `minor`=P3.

## 3. 권장 패턴

- **패턴 A — axe-core 실행 + codex 분석 분리**:
  ```bash
  # 1단계: axe-core 실행 (bun 스크립트 또는 browse 스킬)
  bun run .crew/scripts/axe-audit.ts http://localhost:3000/target > axe-results.json
  # 2단계: codex에 분류 위임
  run_codex "다음 axe-core JSON을 P0~P3 우선순위로 분류하고 수정 방법을 한국어로 작성: $(cat axe-results.json)"
  # 3단계: Claude가 검증 후 accessibility-report.md 작성
  ```
- **패턴 B — 색상 대비 검사 분리**: `contrast_check`는 axe-core가 놓치는 케이스(배경 이미지, opacity 중첩)가 있으므로 별도 CSS 분석. `grep -E 'color|background' src/app/**/*.css` 후 명도 대비비 수동 계산 보완.
- **패턴 C — frontend-engineering 핸드오프 포맷**: accessibility-report.md P0/P1 섹션에 "수정 코드 예시" 포함 필수. 디자이너용 권고(색상 변경)와 개발자용 권고(ARIA 추가, role 수정)를 명확히 분리.

## 4. 체크리스트 (5건 필수)
- [ ] Preflight: sidecar 상태 + target_url 응답 200 확인 후 axe 실행
- [ ] SR-3: target_url이 localhost 패턴인지 grep 검사 완료
- [ ] viz `agent_start` (작업 시작 전) / `agent_end` (완료 후) emit 누락 0
- [ ] 판정 로직 준수: critical > 0 또는 serious > 0이면 FAIL (CONDITIONAL 오판 금지)
- [ ] a11y-verdict.json `"via": "gpt-5-codex (codex CLI)"` 필드 포함

## 5. 참고
- 부모 deep-review: deep-review_designimport품질진단_20260630
- 후속 hotfix: PR #14 (Critical) + PR #15 (Major)
- 본 plan: plan_designimport정밀화 (F-R-A1)
- 협업: F5 visual-fidelity-verifier (병렬), frontend-engineering (P0/P1 위반 수정), ux-designer (ARIA/키보드 개선안)
- G-SIDECAR gotcha: `curl localhost:3099/api/agents/data` 404이면 `build-sidecar.sh` 재빌드 필수
