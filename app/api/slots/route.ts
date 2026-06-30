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
  kstDateTimeToUtcIso,
  BREAK_MINUTES,
  ADJUSTMENT_BREAK_MINUTES,
  ONEDAY_PREP_MINUTES,
} from "../../../lib/businessRules";

function dateRangeFromKstDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const startAt = kstDateTimeToUtcIso(dateKey, "00:00");
  const next = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
  const nextDateKey = dateKeyInKst(next);
  const endAt = kstDateTimeToUtcIso(nextDateKey, "00:00");
  return { startAt, endAt };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    const dateKey = searchParams.get("date");
    const supabase = getSupabaseAdmin();
    const cutoff = reservationCutoffDate().toISOString();
    const cutoffTime = new Date(cutoff).getTime();
    const dateRange = dateKey ? dateRangeFromKstDateKey(dateKey) : null;

    let lessonMinutes = normalizeLessonDurationMinutes(null);
    if (studentId) {
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("lesson_duration_minutes")
        .eq("id", studentId)
        .maybeSingle();
      if (studentError) throw studentError;
      lessonMinutes = normalizeLessonDurationMinutes(student?.lesson_duration_minutes);
    }

    let slotQuery = supabase
      .from("available_slots")
      .select("id, start_at, end_at")
      .eq("is_open", true)
      .gte("start_at", cutoff)
      .order("start_at", { ascending: true });

    if (dateRange) {
      const rangeStart = new Date(dateRange.startAt).getTime() > cutoffTime ? dateRange.startAt : cutoff;
      slotQuery = slotQuery.gte("start_at", rangeStart).lt("start_at", dateRange.endAt);
    }

    const { data: slots, error: slotsError } = await slotQuery;
    if (slotsError) throw slotsError;

    let bookingQuery = supabase
      .from("regular_bookings")
      .select("id, slot_id, start_at, end_at, status")
      .in("status", ["booked", "change_request", "cancel_request"]);

    if (dateRange) {
      bookingQuery = bookingQuery.lt("start_at", dateRange.endAt).gt("end_at", dateRange.startAt);
    }

    const { data: bookings, error: bookingsError } = await bookingQuery;
    if (bookingsError) throw bookingsError;

    let onedayQuery = supabase
      .from("oneday_classes")
      .select("id, start_at, end_at")
      .eq("is_open", true)
      .gte("end_at", dateRange ? dateRange.startAt : cutoff);

    if (dateRange) {
      onedayQuery = onedayQuery.lt("start_at", dateRange.endAt);
    }

    const { data: onedayClasses, error: onedayError } = await onedayQuery;
    if (onedayError) throw onedayError;

    let blockedQuery = supabase
      .from("blocked_times")
      .select("id, start_at, end_at")
      .gte("end_at", dateRange ? dateRange.startAt : cutoff);

    if (dateRange) {
      blockedQuery = blockedQuery.lt("start_at", dateRange.endAt);
    }

    const { data: blockedTimes, error: blockedError } = await blockedQuery;
    if (blockedError) throw blockedError;

    const activeBookings = bookings || [];
    const activeOnedayBlocks = onedayClasses || [];
    const activeBlockedTimes = blockedTimes || [];

    const isSlotAvailable = (slot: { id?: string; start_at: string; end_at?: string }, allowAutoAdjustment = false) => {
      if (new Date(slot.start_at).getTime() < cutoffTime) return false;
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
      .map((slot) => {
        const rule = regularLessonRule(slot.start_at, lessonMinutes);
        return {
          ...slot,
          end_at: lessonEndIso(slot.start_at, lessonMinutes),
          lesson_minutes: rule.lessonMinutes,
          break_minutes: rule.breakMinutes,
          rule_label: rule.label,
          is_auto_adjustment: false,
        };
      });

    const dateKeys = dateKey
      ? [dateKey]
      : Array.from(new Set((slots || []).map((slot) => dateKeyInKst(new Date(slot.start_at)))));

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
      for (const currentDateKey of dateKeys) {
        const candidates = buildAdjustmentSlotStartTimesForDate(currentDateKey, isSaturdayDateKey(currentDateKey));
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

    return NextResponse.json({ slots: available, lesson_minutes: lessonMinutes, date: dateKey || null });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
