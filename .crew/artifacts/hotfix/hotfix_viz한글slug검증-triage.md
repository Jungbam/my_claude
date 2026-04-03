# Hotfix Triage — hotfix_viz한글slug검증

**날짜**: 2026-04-03
**심각도**: Critical
**영향 범위**: bams-viz DAG / Gantt / Timeline / Log 탭 전체 (한글 slug 사용 시)
**상위 파이프라인**: hotfix_viz파이프라인중복표시

---

## 결함 요약

`event-store.ts`의 `validateParam` 메서드가 ASCII 문자만 허용하는 regex를 사용하고 있었음.
한글 slug(`hotfix_viz파이프라인중복표시` 등)가 입력되면 validation에서 `Error`를 throw하여
viz UI의 주요 탭(DAG, Gantt, Timeline, Log, Mermaid)이 모두 렌더링 불가 상태가 됨.

---

## 근본 원인 분석

### 버그 위치
- **파일**: `plugins/bams-plugin/tools/bams-viz/src/lib/event-store.ts`
- **라인**: 50 (수정 전)
- **메서드**: `EventStore.validateParam(param: string)`

### 결함 코드
```typescript
// 수정 전 — ASCII만 허용
private static validateParam(param: string): void {
  if (!param || !/^[a-zA-Z0-9_\-]{1,128}$/.test(param)) {
    throw new Error(`Invalid parameter: ${param}`)
  }
}
```

### 영향 경로

| 호출 경로 | 검증 여부 | 영향 |
|-----------|----------|------|
| `getPipeline(slug)` | validateParam(slug) | DAG, Gantt 탭 장애 |
| `getRawEvents(slug)` | validateParam(slug) | Timeline, Log 탭 장애 |
| `getMermaid(slug)` | getPipeline() 호출 경유 | Mermaid 다이어그램 장애 |
| `getEventsSince(since, pipeline)` | pipeline 미검증 | 폴링 정상 동작 |
| `getPipelines()` | 미검증 | 목록 표시 정상 |

---

## 수정 내용

### 수정 코드
```typescript
// 수정 후 — Unicode-aware regex (한글 포함 모든 유니코드 문자 허용)
/** Validate slug/date to prevent path traversal.
 * Allows all Unicode letters and numbers (including Korean) via \p{L} and \p{N}.
 * Blocks path traversal characters: /, \, and double-dot (..) sequences.
 */
private static validateParam(param: string): void {
  if (!param || !/^[\p{L}\p{N}_\-]{1,256}$/u.test(param)) {
    throw new Error(`Invalid parameter: ${param}`)
  }
}
```

### 변경 사항
- `[a-zA-Z0-9_\-]` → `[\p{L}\p{N}_\-]` + `/u` 플래그: 한글 및 모든 유니코드 문자 허용
- 길이 제한 128자 → 256자 확장

### 보안 유지 항목
- `/`, `\` 차단: `\p{L}`과 `\p{N}`에 슬래시/백슬래시 미포함
- `..` 차단: 점(`.`) 미포함 (`.` is not in `\p{L}` or `\p{N}`)
- 길이 제한 유지: 256자 이내

---

## 검증 결과

| 입력 | 기대 | 결과 |
|------|------|------|
| `hotfix_viz파이프라인중복표시` | PASS | PASS |
| `hotfix_viz한글slug검증` | PASS | PASS |
| `normal-slug-123` | PASS | PASS |
| `feature_새기능추가` | PASS | PASS |
| `../etc/passwd` | FAIL (throw) | FAIL (throw) |
| `` (빈 문자열) | FAIL (throw) | FAIL (throw) |
| `a/b` | FAIL (throw) | FAIL (throw) |
| `a\b` | FAIL (throw) | FAIL (throw) |

---

## 재발 방지

### gotcha 추가 권고
`.crew/gotchas.md`에 다음 항목 추가 권고:
> slug/param 검증 regex는 Unicode-aware 패턴(`\p{L}`, `\p{N}` + `/u` flag)을 사용할 것.
> 한글, 일본어, 중국어 등 비ASCII 문자를 slug에 허용하려면 ASCII 전용 regex를 피할 것.

### 조치 후 필요 사항
- viz 서버 재시작 (사용자 수동 수행)
- 빌드: `bun run build` (bams-viz 디렉터리에서)

---

## 타임라인

| 시각 | 이벤트 |
|------|--------|
| 2026-04-03 | 상위 파이프라인 hotfix_viz파이프라인중복표시 완료 후 한글 slug 네이밍 규칙 적용 |
| 2026-04-03 | viz DAG/Gantt/Timeline/Log 전체 렌더링 불가 증상 보고 |
| 2026-04-03 | validateParam regex ASCII 제한이 근본 원인으로 진단 |
| 2026-04-03 | Unicode-aware regex로 수정 완료 (`/^[\p{L}\p{N}_\-]{1,256}$/u`) |

