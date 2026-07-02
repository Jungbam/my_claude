# Dev: 공통 규칙

> 이 파일은 `/bams:dev` 파이프라인의 공통 규칙을 정의합니다.
> 엔트리포인트(`dev.md`)에서 모든 Phase 실행 전 Read하여 로드합니다.

---

## 공통 규칙 로드

**반드시 `plugins/bams-plugin/commands/bams/_shared_common.md`를 Read하여 공통 규칙을 로드합니다.**

---

## 경량 경로 (`--minimal`)

`--minimal`이 활성화된 경우(tracking 파일 `minimal_mode: true`), 각 Phase 실행 시 다음을 준수합니다:

- **`plugins/bams-plugin/references/lightweight-path-protocol.md` 참조.** 플래그 인식/자동 감지/스팸 방지/축약 규칙 표준 프로토콜을 따릅니다.
- 적용 대상 Phase는 SSOT §"dev" 축약 표를 확인합니다 (예: Phase 0 스킵, Phase 2 Advisor 스킵).
- `--minimal` 미사용 시 이 섹션은 무시하고 기존 Phase 절차를 그대로 따릅니다.

차이점: 없음.

---

dev 파이프라인에 고유한 추가 규칙은 없습니다. 그 외 모든 규칙은 공통 규칙 파일에 정의되어 있습니다.
