export async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, delayMs = 50): Promise<T | undefined> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.warn(`attempt ${attempt} failed`, err);
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  return undefined;
}
