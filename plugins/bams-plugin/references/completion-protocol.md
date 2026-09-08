# 마무리 표준 프로토콜

모든 pipeline 스킬의 마무리 단계에서 공통으로 수행하는 절차입니다.
각 스킬은 이 프로토콜을 참조하고, 스킬별 Learnings 카테고리만 기술합니다.

## Step 1: Pipeline Learnings 기록

`.crew/config.md`의 `## Pipeline Learnings` 섹션을 업데이트합니다 (없으면 추가).

**기록 규칙** (references/pipeline-learnings-taxonomy.md 참조):
- `- [YYYY-MM-DD] category: 내용` 형식
- 이전과 중복되는 내용은 추가하지 않음 (같은 카테고리+대상의 이전 항목은 교체)
- 최대 30개 항목 유지
- 제거 우선순위: 표시 없는 정보성 항목 → `⚠` 항목 → `🔴` 항목 (🔴은 제거 대상에서 제외)

## Step 2: Gotchas 승격 검사

**gotchas-spec.md의 자동 승격 규칙에 따라 검사**합니다. 스킬별 인라인 규칙 기술 금지.

승격 조건 요약:
- 같은 영역/파일에 **3회 이상** Learnings 이슈 → 자동 제안
- hotfix 근본 원인이 **패턴 실수** → 자동 제안
- 보안 감사에서 **Critical** 발견 → 자동 제안 (사용자 확인 필요)
- 사용자가 "기억해" / "gotcha" 언급 → 즉시 추가

**중요: Critical 포함 모든 승격은 AskUserQuestion으로 사용자 확인을 받습니다.**
(SECURITY-1 수정: 무확인 자동 추가 금지)

승인 시:
1. `.crew/gotchas.md`에 항목 추가 (없으면 templates/gotchas.md 기반 생성)
2. `.crew/gotchas.md`에서 상위 5개를 추출

## Step 3: CLAUDE.md Gotchas 동기화

**CLAUDE.md 수정 전 반드시 사용자 확인**:
1. 현재 `## Gotchas` 섹션과 새 상위 5개의 diff를 표시
2. AskUserQuestion — "CLAUDE.md의 Gotchas 섹션을 업데이트할까요?"
3. 승인 시에만 Edit으로 반영

(SECURITY-3 수정: 지속적 컨텍스트 오염 방지)

## Step 4: 진행 추적 파일 완료 처리

- `status: completed`, `completed_at: [ISO timestamp]` 기록
- 모든 Step 상태 최종 확인
- Execution Log 하단에 산출물 경로 정리
- 커밋 생성 시 ship SKILL §Step 6-6 Staging hygiene를 준수한다(index 초기화 → 경로 지정 add → `git diff --cached --name-only` 검증) — `git add -A` 단독 사용으로 기존 스테이징이 커밋에 혼입되지 않도록 한다.

## Step 4.2: 거버넌스 문서 갱신 (project-governance 1회 호출)

파이프라인 완료 기록(Step 4.5) 전, 거버넌스 문서 신선도를 점검하고 갱신을 산출합니다.

- (a) 이번 파이프라인의 변경분을 `.crew/board.md`에 `TASK-NNN`으로 등재한다 — project-governance는 쓰기 권한이 없으므로 전문을 반환하고 메인이 저장한다(등재 대상 없으면 '등재 불요' 명시).
- (b) 아키텍처/스택/배포환경 변경이 감지되면 `.crew/config.md`의 해당 섹션만 갱신한다 — **Pipeline Learnings 섹션은 보존**한다(덮어쓰기 금지).
- (c) `CLAUDE.md`는 편집하지 않는다 — '갱신 필요 항목'만 리스트업하여 보고한다.

## Step 4.5: 파이프라인 완료 기록 (history.md — 상태 판별의 SSOT)

파이프라인 마무리 시 `.crew/history.md`에 완료 1줄 블록을 append합니다. **파이프라인 상태(진행 중/완료/실패)의 SSOT는 `.crew/history.md`입니다** — 별도 이벤트 기록 없이 이 파일만으로 상태를 판별합니다.

기록 형식(기존 history.md 형식 유지):
```
## YYYY-MM-DD | {slug} | {STATUS}
- type: {command}
- status: {완료|실패|중단}
- 산출물: {산출물 경로 목록 또는 없음}
- 요약: {한 줄 요약}
```

- `{STATUS}`: `완료` / `실패` / `중단`.
- 태스크 단위 상태는 `.crew/board.md`, 파이프라인 이력은 `.crew/history.md`로 이원화합니다.

## Step 4.9: Context Health 평가 및 /compact 제안

파이프라인 완료 시점의 context 상태를 평가하고, 필요 시 `/compact`를 제안합니다.

**평가 기준 (Bash로 확인):**
```bash
# 세션 도구 호출 횟수 확인
SESSION_ID="${CLAUDE_SESSION_ID:-${PPID:-default}}"
COUNTER_FILE="/tmp/claude-tool-count-${SESSION_ID}"
TOOL_COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
echo "[Context Health] 세션 도구 호출: ${TOOL_COUNT}회"
```

**판단:**
- Edit/Write 50회 이상 **또는** 파이프라인 총 Step 5개 이상 → `/compact` 강력 권고
- Edit/Write 30회 이상 → `/compact` 제안
- 그 외 → 스킵

**제안 시 출력 형식:**
```
[Context Health] 세션 도구 호출: {N}회, 파이프라인 Steps: {M}개
→ /compact 권장: 다음 작업 전에 context를 정리하면 응답 품질이 향상됩니다.
  /compact {slug} 파이프라인 완료 — {1줄 요약}
```

**주의:**
- `/compact`는 사용자/AI가 직접 입력해야 합니다 (프로그래밍적 자동 실행 불가)
- compact 제안 시 **요약 메시지**를 함께 제공하여, compact 후에도 맥락이 보존되도록 합니다
- Step 5(완료 요약) 출력 **직후** 제안합니다 (완료 요약을 compact으로 손실시키지 않기 위해)

**안전한 compact 시점 (금지 구간 주의):**
- 금지: Step 실행 중, retro KPT 작성 중, 파이프라인 완료 기록(Step 4.5) 전
- 권장: completion-protocol 저장 완료 직후 또는 history.md 기록 + retro 완료 후

## Step 4.95: 회고 실행 트리거 (CLAUDE.md §5 가드)

파이프라인 완료 기록(Step 4.5) 직후, `pipeline_type ∈ {feature, dev, hotfix, deploy, debug, review, deep-review, verify, sprint}`이고 `status = "완료"`인 경우 메인은 다음 AskUserQuestion을 의무 발화한다 (스킵 금지). 단, §스팸 방지 조건에 해당하면 AskUserQuestion 대신 조건부 생략 처리한다:

```
Question: "{slug} 파이프라인 회고를 실행할까요?"
Header: "회고 실행"
Options:
- (A) 회고 실행 — `/bams:retro {slug}` 자동 트리거 (Recommended)
- (B) 스킵 — 사유 명시 (history.md 완료 기록의 요약에 스킵 사유 병기)
- (C) 다음 사이클로 이연 (weekly retro에서 일괄 처리)
```

사용자 응답 처리:
- A 선택: 메인이 즉시 `/bams:retro {slug}` 호출
- B/C 선택: `.crew/history.md`의 해당 파이프라인 완료 기록 요약에 스킵/이연 사유를 병기한다.

본 가드 우회 시 CLAUDE.md §5 위반.

### 스팸 방지 조건 (정성 기준)

`pipeline_type ∈ {debug, review, deep-review, verify, sprint}`에 한해, 다음 중 하나에 해당하면 AskUserQuestion을 생략하고 "회고 생략 제안"만 출력한다:
- **변경 0줄이고 산출물이 없는 경우** (`git diff --stat` 결과 변경 없음 + 신규 산출물 파일 없음)
- **또는** `pipeline_type ∈ {review, deep-review, verify}`의 읽기 전용 성격 파이프라인으로 코드 변경이 없는 경우

**`feature/dev/hotfix/deploy`는 예외 없이 위 스팸 방지 조건이 적용되지 않는다**(코드 변경 파이프라인은 회고 가치가 항상 있음 — CLAUDE.md §5 "스킵 불가 원칙" 위반 방지).

생략 시 처리:
```
[회고 스킵] {slug} — 변경 없음/읽기 전용 파이프라인으로 회고 생략 제안 (사유: history.md 완료 기록에 병기).
```

## Step 5: 완료 요약 출력

통일된 형식:
```
[파이프라인명] 완료
══════════════════
  [각 Step 상태 — ✓/⊘/✗]

기록: .crew/history.md
산출물: .crew/artifacts/{prd,design,review,report}/...

다음: [추천 명령어]
```
