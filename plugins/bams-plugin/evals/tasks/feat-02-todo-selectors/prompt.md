할 일 목록 화면의 상태 로직(src/selectors.ts)을 확장해 주세요.
1. `selectVisible`이 `filter.search`(제목 부분 일치, 대소문자 무시, 앞뒤 공백 제거, 빈 문자열이면 전체)와 `filter.sort`를 지원하도록: `"created"`는 createdAt 내림차순(최신 먼저), `"priority"`는 priority 내림차순(3이 가장 급함) 후 createdAt 내림차순. 어느 경우든 동률이면 id 오름차순. 기존 status 필터와 함께 동작하고 state.todos 원본 배열은 변경하면 안 됩니다. sort가 없으면 "created".
2. `counts(state)`를 export: `{all, active, done}` — search는 반영하되 status 필터는 무시하고 센 개수(탭 배지용).
