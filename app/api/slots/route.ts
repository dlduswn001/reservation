import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import {
  isLessonWithinOperatingHours,
  lessonEndIso,
  normalizeLessonDurationMinutes,
  conflictsWithOneDayBlocks,
  conflictsWithRegularBookings,
  regularLessonRule,
  reservationCutoffDate,
  overlapsAnyTimeBlock,
} from "../../../lib/businessRules";
import { canBookWithRegularPassPolicy, getRegularPassPolicyStatus, type RegularPassPolicyStudent } from "../../../lib/passPolicy";
import { getErrorMessage, isMissingPassColumnError } from "../../../lib/supabaseCompat";

type KstMonthRange = {
  year: number;
  month: number;
  rangeStartIso: string;
  rangeEndIso: string;
  currentMonthKey: string;
  nextMonthKey: string;
  preferNextMonth: boolean;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function kstParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonth(year: number, month: number, amount: number) {
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function normalizeRequestedMonthKey(value: string | null) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [year, month] = raw.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return monthKey(year, month);
}

function kstDateTimeToIso(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second, millisecond)).toISOString();
}

function kstMonthKeyFromIso(value: string) {
  const parts = kstParts(new Date(value));
  return monthKey(parts.year, parts.month);
}

function openScheduleSearchRange(cutoffDate: Date): KstMonthRange {
  const cutoffParts = kstParts(cutoffDate);
  const nextMonth = addMonth(cutoffParts.year, cutoffParts.month, 1);
  const nextMonthLastDay = daysInMonth(nextMonth.year, nextMonth.month);

  // 수강생 예약 화면은 빠르게 뜨도록 최대 두 달치까지만 확인합니다.
  // 단, 실제 화면에는 한 달치만 보여줍니다.
  // 월말(25일 이후)에 다음 달 시간표가 만들어져 있으면 다음 달을 기본 공개합니다.
  return {
    year: cutoffParts.year,
    month: cutoffParts.month,
    rangeStartIso: cutoffDate.toISOString(),
    rangeEndIso: kstDateTimeToIso(nextMonth.year, nextMonth.month, nextMonthLastDay, 23, 59, 59, 999),
    currentMonthKey: monthKey(cutoffParts.year, cutoffParts.month),
    nextMonthKey: monthKey(nextMonth.year, nextMonth.month),
    preferNextMonth: cutoffParts.day >= 25,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    const requestedMonthKey = normalizeRequestedMonthKey(searchParams.get("month"));
    const supabase = getSupabaseAdmin();
    const cutoffDate = reservationCutoffDate();
    const cutoff = cutoffDate.toISOString();
    const monthRange = openScheduleSearchRange(cutoffDate);
    const rangeStart = monthRange.rangeStartIso;
    const rangeEnd = monthRange.rangeEndIso;

    const requestedLessonMinutes = Number(searchParams.get("lessonMinutes") || 0);
    let lessonMinutes = normalizeLessonDurationMinutes(
      Number.isFinite(requestedLessonMinutes) && requestedLessonMinutes > 0 ? requestedLessonMinutes : null,
    );

    let studentPassPolicy: RegularPassPolicyStudent | null = null;
    let studentPassStatus: ReturnType<typeof getRegularPassPolicyStatus> | null = null;

    // 학생 정보에 수업 시간이 이미 담겨 있으면 화면에서 넘겨받아 학생 조회 1번을 줄입니다.
    // 다만 8월 1일 이후 수강권 사용기한 정책은 학생별로 확인해야 하므로 studentId가 있으면 함께 조회합니다.
    if (studentId) {
      let studentResult = await supabase
        .from("students")
        .select("lesson_duration_minutes, pass_registered_at, pass_first_lesson_at, pass_expires_at, pass_extension_until")
        .eq("id", studentId)
        .maybeSingle();

      if (studentResult.error && isMissingPassColumnError(studentResult.error)) {
        studentResult = await supabase
          .from("students")
          .select("lesson_duration_minutes")
          .eq("id", studentId)
          .maybeSingle();
      }

      if (studentResult.error) throw studentResult.error;
      const student = studentResult.data;
      if (!requestedLessonMinutes) {
        lessonMinutes = normalizeLessonDurationMinutes(student?.lesson_duration_minutes);
      }
      if (student && "pass_registered_at" in student) {
        studentPassPolicy = student;
        studentPassStatus = getRegularPassPolicyStatus(student);
      }
    }

    const { data: slots, error: slotsError } = await supabase
      .from("available_slots")
      .select("id, start_at, end_at")
      .eq("is_open", true)
      .gte("start_at", rangeStart)
      .lte("start_at", rangeEnd)
      .order("start_at", { ascending: true })
      .limit(1200);
    if (slotsError) throw slotsError;

    const { data: bookings, error: bookingsError } = await supabase
      .from("regular_bookings")
      .select("id, slot_id, start_at, end_at, status")
      .in("status", ["booked", "change_request", "cancel_request"])
      .gte("end_at", cutoff)
      .lte("start_at", rangeEnd);
    if (bookingsError) throw bookingsError;

    const { data: onedayClasses, error: onedayError } = await supabase
      .from("oneday_classes")
      .select("id, start_at, end_at")
      .eq("is_open", true)
      .gte("end_at", cutoff)
      .lte("start_at", rangeEnd);
    if (onedayError) throw onedayError;

    const { data: blockedTimes, error: blockedError } = await supabase
      .from("blocked_times")
      .select("id, start_at, end_at")
      .gte("end_at", cutoff)
      .lte("start_at", rangeEnd);
    if (blockedError) throw blockedError;

    const activeBookings = bookings || [];
    const activeOnedayBlocks = onedayClasses || [];
    const activeBlockedTimes = blockedTimes || [];

    const isSlotAvailable = (slot: { id?: string; start_at: string; end_at?: string }) => {
      if (!isLessonWithinOperatingHours(slot.start_at, lessonMinutes)) return false;

      const candidateEndAt = lessonEndIso(slot.start_at, lessonMinutes);
      if (studentPassPolicy && !canBookWithRegularPassPolicy(studentPassPolicy, slot.start_at).ok) return false;
      if (conflictsWithOneDayBlocks(slot.start_at, candidateEndAt, activeOnedayBlocks)) return false;
      if (overlapsAnyTimeBlock(slot.start_at, candidateEndAt, activeBlockedTimes)) return false;

      return !activeBookings.some((booking) => (
        (slot.id && booking.slot_id === slot.id)
        || conflictsWithRegularBookings(slot.start_at, candidateEndAt, [{ start_at: booking.start_at, end_at: booking.end_at }])
      ));
    };

    const available = (slots || [])
      .filter((slot) => isSlotAvailable(slot))
      .map((slot) => {
        const rule = regularLessonRule(slot.start_at, lessonMinutes);
        return {
          ...slot,
          end_at: lessonEndIso(slot.start_at, lessonMinutes),
          lesson_minutes: rule.lessonMinutes,
          break_minutes: rule.breakMinutes,
          rule_label: rule.label,
        };
      })
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    const availableMonthCountMap = new Map<string, number>();
    for (const slot of available) {
      const key = kstMonthKeyFromIso(slot.start_at);
      availableMonthCountMap.set(key, (availableMonthCountMap.get(key) || 0) + 1);
    }

    const availableMonths = Array.from(availableMonthCountMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => {
        const [year, month] = key.split("-").map(Number);
        return { key, year, month, count };
      });

    const hasRequestedMonthSlots = Boolean(requestedMonthKey && availableMonthCountMap.has(requestedMonthKey));
    const hasCurrentMonthSlots = availableMonthCountMap.has(monthRange.currentMonthKey);
    const hasNextMonthSlots = availableMonthCountMap.has(monthRange.nextMonthKey);

    let visibleMonthKey = requestedMonthKey && hasRequestedMonthSlots
      ? requestedMonthKey
      : monthRange.currentMonthKey;

    if (!requestedMonthKey) {
      if (monthRange.preferNextMonth && hasNextMonthSlots) {
        visibleMonthKey = monthRange.nextMonthKey;
      } else if (hasCurrentMonthSlots) {
        visibleMonthKey = monthRange.currentMonthKey;
      } else if (hasNextMonthSlots) {
        visibleMonthKey = monthRange.nextMonthKey;
      } else if (availableMonths[0]) {
        visibleMonthKey = availableMonths[0].key;
      }
    }

    const visibleAvailable = available.filter((slot) => kstMonthKeyFromIso(slot.start_at) === visibleMonthKey);

    const [visibleYear, visibleMonth] = visibleMonthKey.split("-").map(Number);
    const visibleLastDay = daysInMonth(visibleYear, visibleMonth);
    const visibleMonthStartIso = kstDateTimeToIso(visibleYear, visibleMonth, 1, 0, 0, 0, 0);
    const visibleMonthEndIso = kstDateTimeToIso(visibleYear, visibleMonth, visibleLastDay, 23, 59, 59, 999);

    return NextResponse.json(
      {
        slots: visibleAvailable,
        lesson_minutes: lessonMinutes,
        open_month: {
          key: visibleMonthKey,
          year: visibleYear,
          month: visibleMonth,
          range_start_at: visibleMonthKey === monthRange.currentMonthKey
            ? rangeStart
            : visibleMonthStartIso,
          range_end_at: visibleMonthEndIso,
          mode: requestedMonthKey && hasRequestedMonthSlots
            ? "requested_month"
            : monthRange.preferNextMonth && hasNextMonthSlots && visibleMonthKey === monthRange.nextMonthKey
              ? "next_month"
              : "auto_month",
        },
        available_months: availableMonths,
        pass_policy: studentPassStatus,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error) }, { status: 500 });
  }
}
