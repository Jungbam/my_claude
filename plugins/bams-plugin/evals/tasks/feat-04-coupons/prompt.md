주문 결제 흐름(src/ 아래 checkout → pricing → receipt)에 쿠폰 기능을 추가해 주세요. `Order`에 선택 필드 `coupon?: string`이 생깁니다.
- 코드는 trim + 대문자로 정규화, 공백뿐이면 쿠폰 없음. 주문당 쿠폰 1개. 쿠폰 정의는 새 파일 src/coupons.ts에:
  - `SAVE10`: 소계의 10% 할인(센트 반올림, 0.5는 올림)
  - `FLAT5`: 500센트 할인, 소계가 2000센트 이상일 때만(미만이면 미적용, error "min_subtotal")
  - `FREESHIP`: 배송비 0 (할인액은 0)
  - 그 외: 미적용, error "unknown". 이 경우에도 주문은 실패하지 않고 할인 없이 계산.
- `Priced`에 `discountCents`(항상 존재, 쿠폰 없으면 0)와 쿠폰이 있을 때만 `coupon: {code, applied, error?}`(code는 정규화된 값) 추가. 할인은 소계를 넘지 않음. 세금은 (소계-할인)에 기존과 같은 방식으로 계산. 무료배송 기준(소계 5000 이상)은 할인 전 소계로 판단. 총액 = 소계 - 할인 + 세금 + 배송비.
- 영수증: 쿠폰이 적용되고 할인액 > 0이면 Subtotal 다음 줄에 `Discount (SAVE10): -$3.00`. 미적용이면 Subtotal 다음 줄에 `Coupon "XYZ" not applied: unknown code` 또는 `... not applied: minimum subtotal not met`. FREESHIP이 적용되면 배송 줄을 `Shipping: $0.00 (FREESHIP)`로. 그 외 형식은 기존 그대로.

제약: 기존 테스트 파일(tests/)은 수정·삭제하지 말고(새 테스트를 추가하는 것은 괜찮습니다), 외부 의존성은 추가하지 마세요(bun 내장 기능만). 작업이 끝나면 `bun test`로 확인해 주세요.
