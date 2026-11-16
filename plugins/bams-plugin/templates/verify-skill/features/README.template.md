# {App} verification map

이 디렉토리는 {App} 사용자 기능 검증의 유지 대상 SSOT다. drive 전에 이 인덱스를 읽고, 해당 기능 파일을 레시피로 쓴다.

## Baseline preconditions

- {App}을 `../SKILL.md` Launch로 `http://localhost:{port}`에 기동 (일회용 데이터 디렉토리/DB)
- {필요한 시드 데이터: 예) 사용자 `verify@example.com`, 샘플 레코드 2건}
- Doctor 통과 후에만 drive. 이 실행이 띄우지 않은 인스턴스는 drive 금지.

## Driving conventions

- 모든 레시피는 baseline 상태에서 시작한다 (전제가 다르면 해당 파일에 명시)
- ARIA role/name, data-testid, route path 우선
- 명령은 문자 그대로 실행한다
- 변경을 가한 레시피는 시드 데이터를 복구하되 증거는 지우지 않는다

## Proof and skip reporting

- 행동과 결과 상태를 함께 캡처한다 (최종 화면만으로 부족)
- UI 증거: snapshot + screenshot (앱 식별 가능)
- API/CLI 증거: 요청·명령, 응답·stdout/stderr, 상태 코드·exit code
- 변경 증거: 저장된 값을 다른 읽기 경로로 재확인
- 도달 불가 경로: 시도한 명령 + 충족되지 않은 전제를 보고. 다른 경로로 검증한 것을 이 경로 검증으로 보고하지 않는다.

## Features

- [{기능 1}](./{feature-1}.md) — {한 줄 범위}
- [{기능 2}](./{feature-2}.md) — {한 줄 범위}
- [{기능 3}](./{feature-3}.md) — {한 줄 범위}
