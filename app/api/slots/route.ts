import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import {
  isLessonWithinOperatingHours,
  lessonEndIso,
  normalizeLessonDurationMinutes,
  conflictsWithOneDayBlocks,
  conflictsWithRegularBookings,
  reservationCutoffDate,
  overlapsAnyTimeBlock,
} from "../../../lib/businessRules";
import { canBookWithRegularPassPolicy, getRegularPassPolicyStatus, type RegularPassPolicyStudent } from "../../../lib/passPolicy";
import { getErrorMessage, isMissingPassColumnError } from "../../../lib/supabaseCompat";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SlotRow = {
  id: string;
  start_at: string;
  end_at?: string | null;
  is_open?: boolean | null;
};

type AvailableMonth = {
  key: string;
  year: number;
  month: number;
  count: number;
};

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

function buildSearchRange(cutoffDate: Date) {
  const cutoffParts = kstParts(cutoffDate);
  const currentKey = monthKey(cutoffParts.year, cutoffParts.month);
  const next = addMonth(cutoffParts.year, cutoffParts.month, 1);
  const nextKey = monthKey(next.year, next.month);
  const afterNext = addMonth(cutoffParts.year, cutoffParts.month, 2);
  const afterNextLastDay = daysInMonth(afterNext.year, afterNext.month);

  return {
    rangeStartIso: cutoffDate.toISOString(),
    rangeEndIso: kstDateTimeToIso(afterNext.year, afterNext.month, afterNextLastDay, 23, 59, 59, 999),
    currentMonthKey: currentKey,
    nextMonthKey: nextKey,
    preferNextMonth: cutoffParts.day >= 25,
  };
}

function monthInfoFromKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  return { key, year, month };
}

function buildMonthRangeIso(key: string) {
  const [year, month] = key.split("-").map(Number);
  const lastDay = daysInMonth(year, month);
  return {
    start: kstDateTimeToIso(year, month, 1, 0, 0, 0, 0),
    end: kstDateTimeToIso(year, month, lastDay, 23, 59, 59, 999),
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
    const searchRange = buildSearchRange(cutoffDate);

    const requestedLessonMinutes = Number(searchParams.get("lessonMinutes") || 0);
    let lessonMinutes = normalizeLessonDurationMinutes(
      Number.isFinite(requestedLessonMinutes) && requestedLessonMinutes > 0 ? requestedLessonMinutes : null,
    );

    let studentPassPolicy: RegularPassPolicyStudent | null = null;
    let studentPassStatus: ReturnType<typeof getRegularPassPolicyStatus> | null = null;

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

    // v20 핵심 수정:
    // 1) 현재 달+다음 달만 보던 범위를 다다음 달까지 넓혀, 월말 다음 달 일정 누락을 줄입니다.
    // 2) is_open 값이 null/옛 데이터인 경우에도 예약 가능 시간으로 인정합니다.
    //    관리자 화면에서 삭제한 예약 가능 시간은 실제 delete 방식이라 수강생 화면에 노출되지 않습니다.
    const { data: rawSlots, error: slotsError } = await supabase
      .from("available_slots")
      .select("id, start_at, end_at, is_open")
      .gte("start_at", searchRange.rangeStartIso)
      .lte("start_at", searchRange.rangeEndIso)
      .order("start_at", { ascending: true })
      .limit(2400);
    if (slotsError) throw slotsError;

    const slots = ((rawSlots || []) as SlotRow[]).filter((slot) => slot.is_open !== false);

    const { data: bookings, error: bookingsError } = await supabase
      .from("regular_bookings")
      .select("id, slot_id, start_at, end_at, status")
      .in("status", ["booked", "change_request", "cancel_request"])
      .gte("end_at", cutoff)
      .lte("start_at", searchRange.rangeEndIso);
    if (bookingsError) throw bookingsError;

    const { data: onedayClasses, error: onedayError } = await supabase
      .from("oneday_classes")
      .select("id, start_at, end_at, is_open")
      .gte("end_at", cutoff)
      .lte("start_at", searchRange.rangeEndIso);
    if (onedayError) throw onedayError;

    const { data: blockedTimes, error: blockedError } = await supabase
      .from("blocked_times")
      .select("id, start_at, end_at")
      .gte("end_at", cutoff)
      .lte("start_at", searchRange.rangeEndIso);
    if (blockedError) throw blockedError;

    const activeBookings = bookings || [];
    const activeOnedayBlocks = (onedayClasses || []).filter((klass: any) => klass.is_open !== false);
    const activeBlockedTimes = blockedTimes || [];

    const isSlotAvailable = (slot: SlotRow) => {
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

    const available = slots
      .filter((slot) => isSlotAvailable(slot))
      .map((slot) => ({
        id: slot.id,
        start_at: slot.start_at,
        end_at: lessonEndIso(slot.start_at, lessonMinutes),
        lesson_minutes: lessonMinutes,
        break_minutes: 30,
        rule_label: `${lessonMinutes}분 수업`,
      }))
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    const availableMonthCountMap = new Map<string, number>();
    for (const slot of available) {
      const key = kstMonthKeyFromIso(slot.start_at);
      availableMonthCountMap.set(key, (availableMonthCountMap.get(key) || 0) + 1);
    }

    const availableMonths: AvailableMonth[] = Array.from(availableMonthCountMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({ ...monthInfoFromKey(key), count }));

    const hasRequestedMonthSlots = Boolean(requestedMonthKey && availableMonthCountMap.has(requestedMonthKey));
    const hasCurrentMonthSlots = availableMonthCountMap.has(searchRange.currentMonthKey);
    const hasNextMonthSlots = availableMonthCountMap.has(searchRange.nextMonthKey);

    let visibleMonthKey = requestedMonthKey && hasRequestedMonthSlots
      ? requestedMonthKey
      : searchRange.currentMonthKey;

    if (!requestedMonthKey) {
      if (searchRange.preferNextMonth && hasNextMonthSlots) {
        visibleMonthKey = searchRange.nextMonthKey;
      } else if (hasCurrentMonthSlots) {
        visibleMonthKey = searchRange.currentMonthKey;
      } else if (hasNextMonthSlots) {
        visibleMonthKey = searchRange.nextMonthKey;
      } else if (availableMonths[0]) {
        visibleMonthKey = availableMonths[0].key;
      }
    }

    // v20: 월 선택 버튼이 제대로 보이도록 전체 월 목록은 유지하되,
    // 실제 시간 버튼은 선택된 한 달치만 내려보냅니다.
    const visibleAvailable = available.filter((slot) => kstMonthKeyFromIso(slot.start_at) === visibleMonthKey);
    const visibleMonth = monthInfoFromKey(visibleMonthKey);
    const visibleRange = buildMonthRangeIso(visibleMonthKey);

    return NextResponse.json(
      {
        slots: visibleAvailable,
        lesson_minutes: lessonMinutes,
        open_month: {
          ...visibleMonth,
          range_start_at: visibleMonthKey === searchRange.currentMonthKey ? searchRange.rangeStartIso : visibleRange.start,
          range_end_at: visibleRange.end,
          mode: requestedMonthKey && hasRequestedMonthSlots
            ? "requested_month"
            : searchRange.preferNextMonth && hasNextMonthSlots && visibleMonthKey === searchRange.nextMonthKey
              ? "next_month"
              : "auto_month",
        },
        available_months: availableMonths,
        pass_policy: studentPassStatus,
        debug: {
          version: "v20",
          raw_slot_count: (rawSlots || []).length,
          open_slot_count: slots.length,
          available_slot_count: available.length,
          returned_slot_count: visibleAvailable.length,
          current_month_key: searchRange.currentMonthKey,
          next_month_key: searchRange.nextMonthKey,
          requested_month_key: requestedMonthKey,
          selected_month_key: visibleMonthKey,
          available_month_keys: availableMonths.map((month) => month.key),
        },
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
    return NextResponse.json({ message: getErrorMessage(error), version: "v20" }, { status: 500 });
  }
}
