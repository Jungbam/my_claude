**판정: {GO|CONDITIONAL-GO|NO-GO}** — Critical {a} / Major {b} / Minor {c} · 핵심 경로 미검증 {d}

<!-- 판정 줄은 리포트 첫 줄이다. 판정은 플러그인 루트 references/issue-severity.md §QA 판정 매핑으로 정한다 — health score로 정하지 않는다. a/b/c는 확인된 결함만 센다(스크립트 후보·unverified 제외). -->

# QA Report: {APP_NAME}

| Field | Value |
|-------|-------|
| **Date** | {DATE} |
| **URL** | {URL} |
| **Branch** | {BRANCH} |
| **PR** | {PR_NUMBER} ({PR_URL}) or "—" |
| **Tier** | Quick / Standard / Exhaustive |
| **Scope** | {SCOPE or "Full app"} |
| **Duration** | {DURATION} |
| **Screenshots** | {COUNT} |
| **Framework** | {DETECTED or "Unknown"} |
| **Index** | [All QA runs](./index.md) |

## 범위·환경

| 항목 | 값 |
|------|-----|
| **분모** | 발견 {D} / 방문 {V} / viewport {K} — 미방문 사유: {사유 또는 "없음"} |
| **diff 영향 범위** | 영향 라우트 {R} 중 {T} 확인 (diff-aware가 아니면 "—") |
| **핵심 경로** | {핵심 경로 목록} — 미검증 {d}개: {경로 또는 "없음"} |
| **서버 종류** | dev / prod build / staging — {실행 명령 또는 호스트} |
| **커밋** | {COMMIT_SHA} ({COMMIT_DATE}) |
| **인증 방식** | {실제 세션 / 테스트 계정 / 인증 비활성화 / 비로그인} (쿠키·토큰 값은 적지 않는다) |
| **viewport** | {예: 1280x800, 375x812} |
| **실행 시각** | {ISO 8601, 시간대 포함} |

## Health Score: {SCORE}/100 (참고 지표 — 게이트 아님)

| Category | Score |
|----------|-------|
| Console | {0-100} |
| Links | {0-100} |
| Visual | {0-100} |
| Functional | {0-100} |
| UX | {0-100} |
| Performance | {0-100} |
| Accessibility | {0-100} |

## Top 3 Things to Fix

1. **{ISSUE-NNN}: {title}** — {one-line description}
2. **{ISSUE-NNN}: {title}** — {one-line description}
3. **{ISSUE-NNN}: {title}** — {one-line description}

## Console Health

| Error | Count | First seen |
|-------|-------|------------|
| {error message} | {N} | {URL} |

## Summary

| Severity | issue-severity | Count |
|----------|----------------|-------|
| critical | Critical | {N} |
| high | Major | {N} |
| medium | Minor | {N} |
| low | Minor | {N} |
| **Total** | | **{N}** |

확인 전 후보와 `unverified` 항목은 위 건수에 넣지 않고 `## 미검증·한계`에 적는다.

## Issues

### ISSUE-001: {Short title}

| Field | Value |
|-------|-------|
| **Severity** | {critical / high / medium / low} → {Critical / Major / Minor} |
| **증거 등급** | measured / inferred |
| **Category** | visual / functional / ux / content / performance / console / accessibility |
| **URL** | {page URL} |
| **Viewport** | {viewport} |

**Description:** {What is wrong, expected vs actual.}

**Repro Steps:**

1. Navigate to {URL}
   ![Step 1](screens/issue-001-step-1.png)
2. {Action}
   ![Step 2](screens/issue-001-step-2.png)
3. **Observe:** {what goes wrong}
   ![Result](screens/issue-001-result.png)

증거 등급: 브라우저·스크립트로 직접 관찰했으면 `measured`, 실행하지 않고 입력값 + `file:line` 경로 추적으로 도출했으면 `inferred`. 추측(`guess`)만 있으면 결함으로 올리지 않는다.

---

## 미검증·한계

> 필수 절 — 생략하지 않는다. 미검증 항목이 없으면 "없음"과 그 근거(무엇을 전부 확인했는지)를 적는다.

| 항목 | 상태 | 이유 | 영향 |
|------|------|------|------|
| {예: 로그인 후 설정 화면} | `unverified` | {예: 테스트 계정 없음} | {예: 핵심 경로 — GO 판정에 반영} |
| {예: 확인 못 한 critical 후보} | `unverified-risk` | {예: 재현 실패, 반박도 못 함} | {판정에 반영} |

- 측정 조건 한계: {예: dev 서버 측정값은 운영 성능 수치로 쓰지 않음}
- 자동 검사 한계: {예: 자동 검사 위반 0은 접근성 준수 증거가 아님 — 키보드 흐름 수동 확인 여부}
- 건너뛴 단계: {대상 레포 제약으로 건너뛴 QA 단계와 그 제약}

---

## Fixes Applied (if applicable)

| Issue | Fix Status | Commit | Files Changed |
|-------|-----------|--------|---------------|
| ISSUE-NNN | verified / best-effort / reverted / deferred | {SHA} | {files} |

### Before/After Evidence

#### ISSUE-NNN: {title}
**Before:** ![Before](screens/issue-NNN-before.png)
**After:** ![After](screens/issue-NNN-after.png)

---

## Regression Tests

| Issue | Test File | Status | Description |
|-------|-----------|--------|-------------|
| ISSUE-NNN | path/to/test | committed / deferred / skipped | description |

### Deferred Tests

#### ISSUE-NNN: {title}
**Precondition:** {setup state that triggers the bug}
**Action:** {what the user does}
**Expected:** {correct behavior}
**Why deferred:** {reason}

---

## Ship Readiness

| Metric | Value |
|--------|-------|
| **판정** | {GO / CONDITIONAL-GO / NO-GO} — 첫 줄 판정 줄과 같은 값 |
| 핵심 경로 미검증 | {d} |
| Health score (참고) | {before} → {after} ({delta}) |
| Issues found | N |
| Fixes applied | N (verified: X, best-effort: Y, reverted: Z) |
| Deferred | N |

**PR Summary:** "QA {판정}: found N issues, fixed M, {d} core path(s) unverified, health score X → Y (reference only)."

---

## Regression (if applicable)

| Metric | Baseline | Current | Delta |
|--------|----------|---------|-------|
| Health score | {N} | {N} | {+/-N} |
| Issues | {N} | {N} | {+/-N} |

**Fixed since baseline:** {list}
**New since baseline:** {list}
