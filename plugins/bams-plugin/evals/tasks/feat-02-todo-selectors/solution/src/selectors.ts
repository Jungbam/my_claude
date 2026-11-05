import type { State, Todo } from "./types";

function matchesSearch(t: Todo, q: string): boolean {
  return q === "" || t.title.toLowerCase().includes(q);
}

export function selectVisible(state: State): Todo[] {
  const { status, search = "", sort = "created" } = state.filter;
  const q = search.trim().toLowerCase();
  const rows = state.todos.filter((t) => {
    if (!matchesSearch(t, q)) return false;
    if (status === "active") return !t.done;
    if (status === "done") return t.done;
    return true;
  });
  const byId = (a: Todo, b: Todo) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return [...rows].sort((a, b) => {
    if (sort === "priority" && a.priority !== b.priority) return b.priority - a.priority;
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return byId(a, b);
  });
}

export function counts(state: State): { all: number; active: number; done: number } {
  const q = (state.filter.search ?? "").trim().toLowerCase();
  const rows = state.todos.filter((t) => matchesSearch(t, q));
  const done = rows.filter((t) => t.done).length;
  return { all: rows.length, active: rows.length - done, done };
}
