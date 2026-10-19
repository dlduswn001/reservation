export function defaultBookingTuition(studentMinutes: number | null, lessonMinutes: number): number | null {
  if (studentMinutes === 90 && lessonMinutes === 90) return 65000;
  if (studentMinutes === 45 && lessonMinutes === 45) return 40000;
  if (studentMinutes === 90 && lessonMinutes === 45) return 32500;
  return null;
}

export function validTuitionAmount(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647);
}

export type BookingTuition = {
  booking_id: string;
  amount_krw: number | null;
  confirmed_at: string | null;
  memo: string;
  updated_at: string;
};
