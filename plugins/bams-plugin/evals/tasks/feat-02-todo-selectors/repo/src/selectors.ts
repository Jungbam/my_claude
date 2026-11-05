import type { State, Todo } from "./types";

export function selectVisible(state: State): Todo[] {
  const { status } = state.filter;
  return state.todos.filter((t) => {
    if (status === "active") return !t.done;
    if (status === "done") return t.done;
    return true;
  });
}
