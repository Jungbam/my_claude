# Hotfix: 공통 규칙

> 이 파일은 `/bams:hotfix` 파이프라인의 공통 규칙을 정의합니다.
> 엔트리포인트(`hotfix.md`)에서 Pre-flight 완료 직후 Read하여 로드합니다.

---

## 공통 규칙 로드

**반드시 `plugins/bams-plugin/commands/bams/_shared_common.md`를 Read하여 공통 규칙을 로드합니다.**

---

## 경량 경로 (`--minimal`)

`--minimal`이 활성화된 경우(tracking 파일 `minimal_mode: true`), 각 Step 실행 시 다음을 준수합니다:

- **`plugins/bams-plugin/references/lightweight-path-protocol.md` 참조.** 플래그 인식/자동 감지/스팸 방지/축약 규칙 표준 프로토콜을 따릅니다.
- 적용 대상 Step은 SSOT §"hotfix" 목록을 확인합니다 (Step 1 진단+수정은 축약 없음).
- `--minimal` 미사용 시 이 섹션은 무시하고 기존 Step 절차를 그대로 따릅니다.

차이점: 없음.

---

hotfix 파이프라인에 고유한 추가 규칙은 없습니다. 그 외 모든 규칙은 공통 규칙 파일에 정의되어 있습니다.
