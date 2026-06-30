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
  buildAdjustmentSlotStartTimesForDate,
  autoAdjustmentSlotId,
  dateKeyInKst,
  isAutoAdjustmentCandidate,
  isSaturdayDateKey,
  minutesBetweenIso,
  BREAK_MINUTES,
  ADJUSTMENT_BREAK_MINUTES,
  ONEDAY_PREP_MINUTES,
} from "../../../lib/businessRules";

type KstMonthRange = {
  year: number;
  month: number;
  rangeStartIso: string;
  rangeEndIso: string;
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

function oneOpenMonthRange(cutoffDate: Date): KstMonthRange {
  const cutoffParts = kstParts(cutoffDate);
  const lastDay = daysInMonth(cutoffParts.year, cutoffParts.month);

  const monthStartIso = kstDateTimeToIso(cutoffParts.year, cutoffParts.month, 1, 0, 0, 0, 0);
  const monthEndIso = kstDateTimeToIso(cutoffParts.year, cutoffParts.month, lastDay, 23, 59, 59, 999);

  // 한 달 단위로만 조회하되, 이미 예약 마감된 시간은 제외합니다.
  const rangeStartIso = new Date(
    Math.max(new Date(monthStartIso).getTime(), cutoffDate.getTime()),
  ).toISOString();

  return {
    year: cutoffParts.year,
    month: cutoffParts.month,
    rangeStartIso,
    rangeEndIso: monthEndIso,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    const supabase = getSupabaseAdmin();
    const cutoffDate = reservationCutoffDate();
    const cutoff = cutoffDate.toISOString();
    const monthRange = oneOpenMonthRange(cutoffDate);
    const rangeStart = monthRange.rangeStartIso;
    const rangeEnd = monthRange.rangeEndIso;

    const requestedLessonMinutes = Number(searchParams.get("lessonMinutes") || 0);
    let lessonMinutes = normalizeLessonDurationMinutes(
      Number.isFinite(requestedLessonMinutes) && requestedLessonMinutes > 0 ? requestedLessonMinutes : null,
    );

    // 학생 정보에 수업 시간이 이미 담겨 있으면 화면에서 넘겨받아 학생 조회 1번을 줄입니다.
    // lessonMinutes가 넘어오지 않은 예전 화면도 그대로 동작하도록 studentId 조회는 fallback으로 남겨둡니다.
    if (!requestedLessonMinutes && studentId) {
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("lesson_duration_minutes")
        .eq("id", studentId)
        .maybeSingle();
      if (studentError) throw studentError;
      lessonMinutes = normalizeLessonDurationMinutes(student?.lesson_duration_minutes);
    }

    const { data: slots, error: slotsError } = await supabase
      .from("available_slots")
      .select("id, start_at, end_at")
      .eq("is_open", true)
      .gte("start_at", rangeStart)
      .lte("start_at", rangeEnd)
      .order("start_at", { ascending: true })
      .limit(500);
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

    const isSlotAvailable = (slot: { id?: string; start_at: string; end_at?: string }, allowAutoAdjustment = false) => {
      if (!isLessonWithinOperatingHours(slot.start_at, lessonMinutes)) return false;
      if (allowAutoAdjustment && !isAutoAdjustmentCandidate(slot.start_at, lessonMinutes)) return false;

      const candidateEndAt = lessonEndIso(slot.start_at, lessonMinutes);
      if (conflictsWithOneDayBlocks(slot.start_at, candidateEndAt, activeOnedayBlocks)) return false;
      if (overlapsAnyTimeBlock(slot.start_at, candidateEndAt, activeBlockedTimes)) return false;

      return !activeBookings.some((booking) => (
        (slot.id && booking.slot_id === slot.id)
        || conflictsWithRegularBookings(slot.start_at, candidateEndAt, [{ start_at: booking.start_at, end_at: booking.end_at }])
      ));
    };

    const normalAvailable = (slots || [])
      .filter((slot) => isSlotAvailable(slot))
      .map((slot) => ({
        ...slot,
        end_at: lessonEndIso(slot.start_at, lessonMinutes),
        lesson_minutes: regularLessonRule(slot.start_at, lessonMinutes).lessonMinutes,
        break_minutes: regularLessonRule(slot.start_at, lessonMinutes).breakMinutes,
        rule_label: regularLessonRule(slot.start_at, lessonMinutes).label,
        is_auto_adjustment: false,
      }));

    const dateKeys = Array.from(new Set((slots || []).map((slot) => dateKeyInKst(new Date(slot.start_at)))));

    const autoAdjustmentSlots = [] as Array<{
      id: string;
      start_at: string;
      end_at: string;
      lesson_minutes: number;
      break_minutes: number;
      rule_label: string;
      is_auto_adjustment: boolean;
      adjustment_label: string;
    }>;

    const hasTightGapReason = (startAt: string) => {
      const endAt = lessonEndIso(startAt, lessonMinutes);
      const candidateDateKey = dateKeyInKst(new Date(startAt));

      const afterRegularTightGap = activeBookings.some((booking) => {
        if (dateKeyInKst(new Date(booking.start_at)) !== candidateDateKey) return false;
        if (new Date(booking.end_at).getTime() > new Date(startAt).getTime()) return false;
        const gap = minutesBetweenIso(booking.end_at, startAt);
        return gap >= ADJUSTMENT_BREAK_MINUTES && gap < BREAK_MINUTES;
      });

      const beforeRegularTightGap = activeBookings.some((booking) => {
        if (dateKeyInKst(new Date(booking.start_at)) !== candidateDateKey) return false;
        if (new Date(endAt).getTime() > new Date(booking.start_at).getTime()) return false;
        const gap = minutesBetweenIso(endAt, booking.start_at);
        return gap >= ADJUSTMENT_BREAK_MINUTES && gap < BREAK_MINUTES;
      });

      const beforeOneDayPrepGap = activeOnedayBlocks.some((block) => {
        if (dateKeyInKst(new Date(block.start_at)) !== candidateDateKey) return false;
        if (new Date(endAt).getTime() > new Date(block.start_at).getTime()) return false;
        const gap = minutesBetweenIso(endAt, block.start_at);
        return gap >= ONEDAY_PREP_MINUTES && gap < BREAK_MINUTES;
      });

      return afterRegularTightGap || beforeRegularTightGap || beforeOneDayPrepGap;
    };

    if (lessonMinutes === 90) {
      for (const dateKey of dateKeys) {
        const candidates = buildAdjustmentSlotStartTimesForDate(dateKey, isSaturdayDateKey(dateKey));
        const chosen = candidates.find((startAt) => (
          hasTightGapReason(startAt) && isSlotAvailable({ start_at: startAt }, true)
        ));

        if (!chosen) continue;
        const rule = regularLessonRule(chosen, lessonMinutes);
        autoAdjustmentSlots.push({
          id: autoAdjustmentSlotId(chosen),
          start_at: chosen,
          end_at: lessonEndIso(chosen, lessonMinutes),
          lesson_minutes: rule.lessonMinutes,
          break_minutes: ADJUSTMENT_BREAK_MINUTES,
          rule_label: "자동 조율 슬롯",
          is_auto_adjustment: true,
          adjustment_label: "추천 시간",
        });
      }
    }

    const available = [...normalAvailable, ...autoAdjustmentSlots]
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    return NextResponse.json(
      {
        slots: available,
        lesson_minutes: lessonMinutes,
        open_month: {
          year: monthRange.year,
          month: monthRange.month,
          range_start_at: rangeStart,
          range_end_at: rangeEnd,
        },
      },
      {
        headers: {
          // 같은 수강생이 같은 화면을 반복해서 열 때 브라우저가 짧게 재사용할 수 있게 합니다.
          // 관리자에서 방금 연 슬롯까지 즉시 반영해야 할 때는 화면의 새로고침 버튼을 누르면 됩니다.
          "Cache-Control": "private, max-age=20",
        },
      },
    );
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
