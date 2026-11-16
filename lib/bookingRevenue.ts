import { defaultBookingTuition, validTuitionAmount } from "./bookingTuition";

/** '학생 직접 신청'은 자동금액 고정, '관리자 직접 예약'만 금액 수정을 허용합니다. */
export type LessonBooking = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  memo?: string | null;
};
export type LessonTuition = {
  booking_id: string;
  student_minutes?: number | null;
  lesson_minutes?: number | null;
  amount_krw: number | null;
  confirmed_at: string | null;
  memo?: string | null;
  updated_at?: string;
};
export type DailyLessonRevenue = {
  date: string;
  bookings: number;
  priced: number;
  unpriced: number;
  total: number;
  confirmed: number;
};

export function bookingOrigin(booking: Pick<LessonBooking, "memo">): "student" | "admin" | "unknown" {
  const memo = booking.memo || "";
  if (memo.startsWith("수강생 직접 예약")) return "student";
  if (memo.startsWith("관리자 직접 예약")) return "admin";
  return "unknown";
}

/** 관리자 입력이라도 수강권 1회를 차감한 정규수업은 이미 결제한 수강권으로 이용합니다. */
export function isPrepaidPassBooking(booking: Pick<LessonBooking, "memo">): boolean {
  const origin = bookingOrigin(booking);
  return origin === "student" || (origin === "admin"
    && /수강권\s*1(?:\.0+)?회\s*차감/.test(String(booking.memo || "")));
}

/** 수강생 직접 예약은 저장된 금액이 없을 때에도 예약 당시 수강생 유형으로 자동 산정합니다. */
export function lessonFee(booking: Pick<LessonBooking, "memo">, tuition?: LessonTuition | null): number | null {
  if (isPrepaidPassBooking(booking)) {
    const metadata = String(booking.memo || "");
    const memoLessonMinutes = Number(metadata.match(/(45|90|120)분 수업/)?.[1] ?? NaN);
    const minutes = tuition?.lesson_minutes ?? (Number.isFinite(memoLessonMinutes) ? memoLessonMinutes : null);
    const studentMinutes = tuition?.student_minutes
      ?? (minutes === 120 ? 120 : null);
    const automatic = minutes === null ? null : defaultBookingTuition(studentMinutes, Number(minutes));
    // Keep any existing historical amount without overwriting the database.
    if (tuition && validTuitionAmount(tuition.amount_krw) && tuition.amount_krw !== null) return tuition.amount_krw;
    return automatic;
  }
  if (!tuition) return null;
  return validTuitionAmount(tuition.amount_krw) ? tuition.amount_krw : null;
}

export function isRevenueBooking(booking: Pick<LessonBooking, "status">): boolean {
  return !["cancelled", "late_cancelled"].includes(booking.status);
}

export function seoulDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (name: string) => parts.find(p => p.type === name)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** '총 매출'은 수업일별 금액 합계이며 입금/현금 흐름이 아닙니다. */
export function dailyLessonRevenue(
  bookings: LessonBooking[],
  tuitions: LessonTuition[],
  date: string
): DailyLessonRevenue {
  const map = new Map(tuitions.map(tuition => [tuition.booking_id, tuition]));
  const summary: DailyLessonRevenue = { date, bookings: 0, priced: 0, unpriced: 0, total: 0, confirmed: 0 };
  for (const booking of bookings) {
    if (!isRevenueBooking(booking) || seoulDayKey(booking.start_at) !== date) continue;
    summary.bookings += 1;
    const tuition = map.get(booking.id);
    const amount = lessonFee(booking, tuition);
    if (amount === null) {
      summary.unpriced += 1;
      continue;
    }
    summary.priced += 1;
    summary.total += amount;
    if (tuition?.confirmed_at) summary.confirmed += amount;
  }
  return summary;
}

export function monthlyLessonRevenue(
  bookings: LessonBooking[],
  tuitions: LessonTuition[],
  month: string
): DailyLessonRevenue[] {
  const dates = Array.from(new Set(bookings
    .filter(isRevenueBooking)
    .map(booking => seoulDayKey(booking.start_at))
    .filter(date => date.startsWith(month)))).sort();
  return dates.map(date => dailyLessonRevenue(bookings, tuitions, date));
}
