import type { Item } from "./types";

export interface Store {
  list(): Item[];
  get(id: string): Item | undefined;
  insert(data: { name: string; price: number }): Item;
}

export function createStore(seed: Item[] = []): Store {
  const items = [...seed];
  let seq = items.length;
  return {
    list: () => [...items],
    get: (id) => items.find((i) => i.id === id),
    insert(data) {
      seq += 1;
      const item: Item = { id: String(seq), ...data };
      items.push(item);
      return item;
    },
  };
}
