# doc-drift 감시 대상 문서 목록

## 감시 대상

| 문서 | 경로 | 감시 이유 | 핵심 섹션 |
|------|------|-----------|-----------|
| CLAUDE.md | `CLAUDE.md` | 커맨드, 프로젝트 구조, 컨벤션 | Commands 섹션, Project Structure |
| README.md | `README.md` | 기능 목록, 설치 방법, 사용법 | Features, Installation, Usage |
| config.md | `.crew/config.md` | 아키텍처, 의존성, 배포 상태 | 기술 스택, 의존성, 배포 환경 |
| bams SKILL | `plugins/bams-plugin/SKILL.md` | 스킬 명령어, 파이프라인 | 스킬 목록, 커맨드 설명 |

## SKILL.md 관련 주의사항

`plugins/bams-plugin/SKILL.md`는 `.tmpl` 파일에서 자동 생성된다.
drift 수정 시 원본인 `SKILL.md.tmpl`을 수정하고 빌드 스크립트를 실행해야 한다.

```bash
# SKILL.md 재생성
bun run gen:skill-docs
```

## 범위 외 파일 (검사 제외)

- `.crew/artifacts/` — 프로젝트별 산출물 (변동 빈번)
- `browse/dist/` — 컴파일된 바이너리
- `test/` — 테스트 파일
- `.crew/memory/` — 에이전트 메모리 (런타임 데이터)
- `.crew/sprints/` — 스프린트 이력
- `node_modules/`, `dist/` — 생성 파일
