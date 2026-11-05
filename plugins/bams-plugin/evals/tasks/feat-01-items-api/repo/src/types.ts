export interface Item {
  id: string;
  name: string;
  price: number;
}

export interface Req {
  method: string;
  path: string;
  body?: unknown;
}

export interface Res {
  status: number;
  body: unknown;
}
