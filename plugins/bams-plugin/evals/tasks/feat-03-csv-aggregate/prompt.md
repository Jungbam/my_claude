주문 CSV를 고객별로 집계하는 `aggregateOrders(csv: string): AggregateResult`를 `src/aggregate.ts`에 만들고 `src/index.ts`에서 export 해주세요. (타입은 src/types.ts, 파서는 기존 src/csv.ts의 parseCsv 사용)
- 헤더 행에서 `customer`, `date`, `amount` 열(선택: `status`)을 이름으로 찾습니다(대소문자 무시, 열 순서 임의, 그 외 열은 무시). 필수 열이 없으면 `missing column: <이름>` 메시지의 Error를 throw.
- status가 `cancelled`(대소문자·공백 무시)인 행은 검증 전에 조용히 제외(집계/skipped 모두 아님). 완전히 빈 줄도 조용히 무시하되 줄 번호에는 포함.
- amount는 `$1,200.50`, `"1,200.5"`, `12`, `-5`, 괄호 `(15.00)`/`($1,000)`(= 환불, 음수) 형식을 받아 정수 센트로 변환. 소수는 최대 2자리, 그 외 형식은 bad_amount.
- date는 실제 존재하는 `YYYY-MM-DD`여야 함(2025-02-30 불가) → 아니면 bad_date. customer/date/amount 중 비었거나 없으면 missing_fields. 검사 순서: missing_fields → bad_date → bad_amount. 건너뛴 행은 `skipped: [{line, reason}]`에 순서대로(line은 헤더=1인 1-based 행 번호).
- 고객은 trim + 소문자 기준으로 묶고 표시 이름은 처음 나온 trim된 값. 결과 `customers: [{customer, orders, totalCents, firstDate, lastDate}]`는 totalCents 내림차순, 동률이면 customer 오름차순. first/lastDate는 날짜 최소/최대.

제약: 기존 테스트 파일(tests/)은 수정·삭제하지 말고(새 테스트를 추가하는 것은 괜찮습니다), 외부 의존성은 추가하지 마세요(bun 내장 기능만). 작업이 끝나면 `bun test`로 확인해 주세요.
