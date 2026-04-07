# Agent Tool Access Policy

## 원칙

에이전트는 역할에 따라 Write/Edit 도구 접근 권한이 구분된다.

### 구현 에이전트 (Write/Edit 가능)

코드나 파일을 직접 생성·수정하는 실행 역할:

- **engineering 부서**: frontend-engineering, backend-engineering, platform-devops, data-integration
- **qa 부서 (실행)**: automation-qa
- **design 부서 전체**: design-director, ui-designer, ux-designer, graphic-designer, motion-designer, design-system-agent
- **hr-agent**

### 분석/전략 에이전트 (Write/Edit 금지)

분석·판단·전략 수립을 담당하며 파일을 직접 수정하지 않는 역할:

- **planning 부서**: product-strategy, business-analysis, ux-research, project-governance
- **evaluation 부서**: product-analytics, experimentation, performance-evaluation, business-kpi
- **qa 부서 (전략)**: qa-strategy, defect-triage, release-quality-gate
- **executive 부서**: pipeline-orchestrator, cross-department-coordinator, executive-reporter, resource-optimizer

## 산출물 저장 규칙

### 분석/전략 에이전트의 산출물 저장 흐름

```
분석/전략 에이전트
  └─ 산출물을 Agent tool output으로 반환
        └─ 호출자(pipeline-orchestrator 또는 부서장)가
           Write 도구로 .crew/artifacts/에 저장
```

- 분석/전략 에이전트는 산출물을 직접 파일로 쓰지 않는다.
- 호출자가 반환된 output을 받아 `.crew/artifacts/{slug}/{phase}/` 경로에 저장한다.
- 산출물 경로는 호출자가 결정하고, 다음 위임 시 `input_artifacts`로 전달한다.

### 구현 에이전트의 산출물 저장 흐름

```
구현 에이전트
  └─ 프로젝트 코드 파일을 Write/Edit로 직접 생성·수정
  └─ 구현 요약을 Agent tool output으로 반환
        └─ 호출자가 요약을 .crew/artifacts/에 기록
```

## 예외

| 에이전트 | 예외 사항 |
|----------|----------|
| pipeline-orchestrator | Write/Edit 금지. tracking 파일 갱신은 Bash(`echo`, `tee`, `jq`)로만 수행 |
| executive-reporter | Write/Edit 금지. 보고서는 output으로 반환하고, 호출자가 저장 |
| automation-qa | Write/Edit 허용 — 테스트 코드 작성이 핵심 역할 |

## frontmatter 선언 방법

에이전트 .md의 frontmatter에 `disallowedTools`로 선언한다:

```yaml
# 분석/전략 에이전트 (Write/Edit 금지)
disallowedTools: Write, Edit

# 구현 에이전트 (제한 없음 — 선언 생략)
```

