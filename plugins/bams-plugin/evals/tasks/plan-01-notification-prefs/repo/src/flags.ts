const flags = new Map<string, boolean>();

export function setFlag(name: string, on: boolean): void {
  flags.set(name, on);
}

export function isEnabled(name: string): boolean {
  return flags.get(name) ?? false;
}
