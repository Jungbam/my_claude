# design-system-agent 상세 규칙 (agent-rules)

> 본문: `plugins/bams-plugin/agents/design-system-agent.md` — 토큰 추출 파이프라인·var() 후처리·전문 영역·codex 위임 stub은 본문에만 존재 (SSOT)
> 이관 근거: plan_spawn로드다이어트 FR-2/FR-9 (정의 파일 300줄 초과 다이어트 — 행동 규칙 상세를 ID 부여 후 verbatim 이관)

경로 폴백(본문 stub이 참조하는 `$_AR` — 서브에이전트 cwd 리셋/타 저장소 위임 대비):

```bash
_AR=$(find ~/.claude/plugins/cache -path "*/bams-plugin/*/references/agent-rules/design-system-agent-rules.md" 2>/dev/null | head -1); [ -z "$_AR" ] && _AR=$(find . -path "*/bams-plugin/references/agent-rules/design-system-agent-rules.md" 2>/dev/null | head -1)
```

### 토큰 정의 시
- 토큰 이름은 `{category}-{property}-{variant}-{state}` 패턴을 따른다
  - 예: `color-background-primary`, `color-text-muted`, `spacing-component-gap-md`
- 다크 모드 토큰은 별도 세트가 아닌 동일 시맨틱 토큰에 다크 모드 값을 매핑
- 절대값(hex, px)은 Primitive 토큰에만 사용 — Semantic/Component 토큰은 참조 형식
- 신규 토큰 추가 시 design-director에게 승인 후 등록

### Figma-코드 싱크 시
Optional — Figma 접근 가능 시에만 적용.
- 변환 스크립트는 Figma Tokens JSON → Style Dictionary 파이프라인을 기반으로 구성
- CSS 출력: `tokens.css` (Custom Properties), JS/TS 출력: `tokens.ts` (typed constants)
- 변환 결과에 토큰 이름, 값, 설명, 마지막 업데이트 날짜를 포함
- Figma와 코드 간 불일치 발견 시 즉시 담당 에이전트에게 알림
- **Figma 접근 불가 시**: 본문 §토큰 추출 파이프라인(목업 → 토큰)으로 대체

### 컴포넌트 문서화 시
- 각 컴포넌트 문서에 반드시 포함: Purpose, Anatomy, Variants, Props, Accessibility, DO/DON'T
- Props 인터페이스는 TypeScript 타입으로 명세화하고 JSDoc 주석 포함
- ui-designer의 Figma 컴포넌트와 frontend-engineering의 코드 컴포넌트를 1:1로 연결

### 버전 관리 시
- 시맨틱 버전(Major.Minor.Patch)으로 디자인 시스템 버전을 관리
- Breaking change(토큰 삭제, 이름 변경): Major 버전 업
- 신규 토큰 추가: Minor 버전 업
- 값 수정, 문서 개선: Patch 버전 업
- 각 릴리즈마다 변경 사항과 마이그레이션 가이드를 CHANGELOG에 기록
