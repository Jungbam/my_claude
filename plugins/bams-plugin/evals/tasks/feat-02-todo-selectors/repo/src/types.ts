export type Status = "all" | "active" | "done";
export type SortKey = "created" | "priority";

export interface Todo {
  id: string;
  title: string;
  done: boolean;
  priority: 1 | 2 | 3; // 3 = most urgent
  createdAt: number;
}

export interface Filter {
  status: Status;
  search?: string;
  sort?: SortKey;
}

export interface State {
  todos: Todo[];
  filter: Filter;
}
