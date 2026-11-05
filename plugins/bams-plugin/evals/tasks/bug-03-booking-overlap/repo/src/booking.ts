import { overlaps } from "./interval";
import type { Booking, Interval } from "./types";

export function findConflicts(existing: Booking[], room: string, candidate: Interval): Booking[] {
  return existing.filter(
    (b) => b.room === room && b.status !== "cancelled" && overlaps(b, candidate),
  );
}

export function canBook(existing: Booking[], room: string, candidate: Interval): boolean {
  return findConflicts(existing, room, candidate).length === 0;
}
