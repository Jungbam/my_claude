아이템 API(src/router.ts)에 생성/단건 조회를 추가해 주세요.
- `POST /items` body `{name, price}`: name은 필수 문자열(앞뒤 공백 제거 후 1~50자), price는 0 이상 유한한 숫자. 성공하면 201과 생성된 아이템 `{id,name,price}`(name은 trim된 값)을 반환. 검증 실패는 400과 `{error:"validation", fields:[...]}` (문제 있는 필드명을 name, price 순서로). body가 없거나 객체가 아니면 두 필드 모두 문제로 취급. 같은 이름(대소문자 무시, trim 후 비교)이 이미 있으면 409 `{error:"duplicate"}`.
- `GET /items/:id`: 있으면 200과 아이템, 없으면 404 `{error:"not_found"}`.
- 알려진 경로(/health, /items, /items/:id)에 허용되지 않는 메서드로 요청하면 405 `{error:"method_not_allowed"}`. 알 수 없는 경로는 기존처럼 404.

제약: 기존 테스트 파일(tests/)은 수정·삭제하지 말고(새 테스트를 추가하는 것은 괜찮습니다), 외부 의존성은 추가하지 마세요(bun 내장 기능만). 작업이 끝나면 `bun test`로 확인해 주세요.
