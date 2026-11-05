export interface Interval {
  start: string; // ISO 8601, may carry any UTC offset
  end: string;
}

export interface Booking extends Interval {
  id: string;
  room: string;
  status?: "active" | "cancelled";
}
