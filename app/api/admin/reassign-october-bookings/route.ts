import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import {
  DEFAULT_LESSON_MINUTES,
  SHORT_LESSON_MINUTES,
  WEEKDAY_REGULAR_START_TIMES,
  WEEKDAY_REGULAR_START_TIMES_45,
  WEEKEND_REGULAR_START_TIMES,
  WEEKEND_REGULAR_START_TIMES_45,
  addMinutesToIso,
  dateKeyInKst,
  isRegularLessonSlotForStudent,
  kstDateTimeToUtcIso,
  lessonEndIso,
  normalizeLessonDurationMinutes,
} from "../../../../lib/businessRules";

type BookingRow = {
  id: string;
  student_id?: string | null;
  slot_id?: string | null;
  start_at: string;
  end_at: string;
  status?: string | null;
  memo?: string | null;
  students?: { lesson_duration_minutes?: number | null } | Array<{ lesson_duration_minutes?: number | null }> | null;
};

type Candidate = {
  start_at: string;
  end_at: string;
  distance: number;
};

const ACTIVE_STATUSES = ["booked", "change_request", "cancel_request"];
const OCTOBER_START = "2026-10-01T00:00:00+09:00";
const NOVEMBER_START = "2026-11-01T00:00:00+09:00";

function getErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  if (error instanceof Error) return error.message;
  return "오류가 발생했습니다.";
}

function weekdayInKst(dateKey: string) {
  const iso = kstDateTimeToUtcIso(dateKey, "12:00");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(new Date(iso));
}

function addDaysToDateKey(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0, 0));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function regularTimesForDate(dateKey: string, lessonMinutes: number) {
  const weekday = weekdayInKst(dateKey);
  if (["Wed", "Thu", "Fri"].includes(weekday)) {
    return lessonMinutes === SHORT_LESSON_MINUTES
      ? WEEKDAY_REGULAR_START_TIMES_45
      : WEEKDAY_REGULAR_START_TIMES;
  }
  if (["Sat", "Sun"].includes(weekday)) {
    return lessonMinutes === SHORT_LESSON_MINUTES
      ? WEEKEND_REGULAR_START_TIMES_45
      : WEEKEND_REGULAR_START_TIMES;
  }
  return [];
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(aStart).getTime() < new Date(bEnd).getTime()
    && new Date(aEnd).getTime() > new Date(bStart).getTime();
}

function hasConflict(candidate: Candidate, booking: BookingRow, allBookings: BookingRow[]) {
  return allBookings.some((other) => {
    if (other.id === booking.id) return false;
    if (!ACTIVE_STATUSES.includes(String(other.status || ""))) return false;
    return overlaps(candidate.start_at, candidate.end_at, other.start_at, other.end_at);
  });
}

function buildCandidatesForBooking(booking: BookingRow, lessonMinutes: number) {
  const originalDateKey = dateKeyInKst(new Date(booking.start_at));
  const originalTime = new Date(booking.start_at).getTime();
  const candidates: Candidate[] = [];

  for (let offset = -3; offset <= 3; offset += 1) {
    const dateKey = addDaysToDateKey(originalDateKey, offset);
    if (dateKey < "2026-10-01" || dateKey > "2026-10-31") continue;
    for (const time of regularTimesForDate(dateKey, lessonMinutes)) {
      const startAt = kstDateTimeToUtcIso(dateKey, time);
      if (!isRegularLessonSlotForStudent(startAt, lessonMinutes)) continue;
      const endAt = lessonEndIso(startAt, lessonMinutes);
      candidates.push({
        start_at: startAt,
        end_at: endAt,
        distance: Math.abs(new Date(startAt).getTime() - originalTime),
      });
    }
  }

  return candidates.sort((a, b) => a.distance - b.distance);
}

async function upsertAvailableSlot(supabase: ReturnType<typeof getSupabaseAdmin>, candidate: Candidate) {
  const { data, error } = await supabase
    .from("available_slots")
    .upsert(
      { start_at: candidate.start_at, end_at: candidate.end_at, is_open: true },
      { onConflict: "start_at", ignoreDuplicates: false }
    )
    .select("id")
    .single();
  if (error) throw error;
  return data?.id || null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("regular_bookings")
      .select("id, student_id, slot_id, start_at, end_at, status, memo, students(lesson_duration_minutes)")
      .in("status", ACTIVE_STATUSES)
      .gte("start_at", OCTOBER_START)
      .lt("start_at", NOVEMBER_START)
      .order("start_at", { ascending: true });

    if (error) throw error;

    const bookings = ((data || []) as BookingRow[]).map((booking) => ({ ...booking }));
    let moved = 0;
    let kept = 0;
    let skipped = 0;
    const details: Array<{ booking_id: string; result: string; from?: string; to?: string }> = [];

    for (const booking of bookings) {
      const studentInfo = Array.isArray(booking.students) ? booking.students[0] : booking.students;
      const lessonMinutes = normalizeLessonDurationMinutes(
        studentInfo?.lesson_duration_minutes || DEFAULT_LESSON_MINUTES
      );
      const expectedEnd = lessonEndIso(booking.start_at, lessonMinutes);
      const alreadyRegular = isRegularLessonSlotForStudent(booking.start_at, lessonMinutes)
        && new Date(expectedEnd).getTime() === new Date(booking.end_at).getTime();

      if (alreadyRegular) {
        kept += 1;
        details.push({ booking_id: booking.id, result: "kept" });
        continue;
      }

      const candidates = buildCandidatesForBooking(booking, lessonMinutes);
      const candidate = candidates.find((item) => !hasConflict(item, booking, bookings));

      if (!candidate) {
        skipped += 1;
        details.push({ booking_id: booking.id, result: "skipped", from: booking.start_at });
        continue;
      }

      const slotId = await upsertAvailableSlot(supabase, candidate);
      const memo = `${booking.memo || ""}${booking.memo ? " / " : ""}10월 시간표 개편으로 가장 가까운 정규수업 시간대로 이동`;
      const { error: updateError } = await supabase
        .from("regular_bookings")
        .update({
          slot_id: slotId,
          start_at: candidate.start_at,
          end_at: candidate.end_at,
          memo,
        })
        .eq("id", booking.id);

      if (updateError) throw updateError;

      booking.slot_id = slotId;
      booking.start_at = candidate.start_at;
      booking.end_at = candidate.end_at;
      booking.memo = memo;
      moved += 1;
      details.push({ booking_id: booking.id, result: "moved", to: candidate.start_at });
    }

    return NextResponse.json({ ok: true, moved, kept, skipped, details });
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error) }, { status: 500 });
  }
}
