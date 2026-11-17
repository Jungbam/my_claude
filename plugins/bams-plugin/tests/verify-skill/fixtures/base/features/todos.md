# todos

할 일을 만들고 목록에서 다시 읽는다.

## Sub-features

- `todo-create` 할 일 생성
- `todo-list` 목록 조회

## How to get to it (user POV)

- `POST /todos`, `GET /todos`

## Driving it with curl

Preconditions:

- `../SKILL.md` Doctor 통과

- **생성.** 실행: `curl -sS -X POST http://localhost:4310/todos -d '{"title":"a"}' -o "$EVID/todo-create.json"`. 결과: 201 + id.
- **영속성 확인.** 실행: `curl -sS http://localhost:4310/todos -o "$EVID/todo-list.json"`. 결과: 방금 만든 title 포함.

## Gotchas

- 시드 2건이 이미 있으므로 개수 대신 title로 확인한다.
