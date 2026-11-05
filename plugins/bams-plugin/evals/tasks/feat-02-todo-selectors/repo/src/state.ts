import type { State, Status } from "./types";

export const initialState: State = { todos: [], filter: { status: "all" } };

export function setStatus(state: State, status: Status): State {
  return { ...state, filter: { ...state.filter, status } };
}
