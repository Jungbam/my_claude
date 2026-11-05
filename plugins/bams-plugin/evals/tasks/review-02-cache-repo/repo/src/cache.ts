interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private entries = new Map<string, Entry<T>>();
  constructor(private ttlMs: number, private now: () => number = Date.now) {}

  get(key: string): T | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: T): void {
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }
}
