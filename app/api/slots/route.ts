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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    const supabase = getSupabaseAdmin();
    const cutoff = reservationCutoffDate().toISOString();

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

    const { data: slots, error: slotsError } = await supabase
      .from("available_slots")
      .select("id, start_at, end_at")
      .eq("is_open", true)
      .gte("start_at", cutoff)
      .order("start_at", { ascending: true });
    if (slotsError) throw slotsError;

    const { data: bookings, error: bookingsError } = await supabase
      .from("regular_bookings")
      .select("id, slot_id, start_at, end_at, status")
      .in("status", ["booked", "change_request", "cancel_request"]);
    if (bookingsError) throw bookingsError;

    const { data: onedayClasses, error: onedayError } = await supabase
      .from("oneday_classes")
      .select("id, start_at, end_at")
      .eq("is_open", true)
      .gte("end_at", cutoff);
    if (onedayError) throw onedayError;

    const { data: blockedTimes, error: blockedError } = await supabase
      .from("blocked_times")
      .select("id, start_at, end_at")
      .gte("end_at", cutoff);
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
    const normalStartsByDate = new Map<string, Set<string>>();
    for (const slot of normalAvailable) {
      const dateKey = dateKeyInKst(new Date(slot.start_at));
      if (!normalStartsByDate.has(dateKey)) normalStartsByDate.set(dateKey, new Set());
      normalStartsByDate.get(dateKey)?.add(slot.start_at);
    }

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

      // 기존 정규수업이 끝난 뒤, 일반 30분 휴식까지는 부족하지만
      // 자동 조율 기준인 20분 휴식은 확보되는 틈을 찾습니다.
      const afterRegularTightGap = activeBookings.some((booking) => {
        if (dateKeyInKst(new Date(booking.start_at)) !== candidateDateKey) return false;
        if (new Date(booking.end_at).getTime() > new Date(startAt).getTime()) return false;
        const gap = minutesBetweenIso(booking.end_at, startAt);
        return gap >= ADJUSTMENT_BREAK_MINUTES && gap < BREAK_MINUTES;
      });

      // 다음 정규수업 전에도 20분 이상은 확보하지만 30분은 안 되는 틈을 허용합니다.
      const beforeRegularTightGap = activeBookings.some((booking) => {
        if (dateKeyInKst(new Date(booking.start_at)) !== candidateDateKey) return false;
        if (new Date(endAt).getTime() > new Date(booking.start_at).getTime()) return false;
        const gap = minutesBetweenIso(endAt, booking.start_at);
        return gap >= ADJUSTMENT_BREAK_MINUTES && gap < BREAK_MINUTES;
      });

      // 원데이 클래스 전에는 최소 10분 준비 시간이 확보되는 틈을 살립니다.
      // 예: 17:50-19:20 정규수업, 19:30 원데이 시작.
      const beforeOneDayPrepGap = activeOnedayBlocks.some((block) => {
        if (dateKeyInKst(new Date(block.start_at)) !== candidateDateKey) return false;
        if (new Date(endAt).getTime() > new Date(block.start_at).getTime()) return false;
        const gap = minutesBetweenIso(endAt, block.start_at);
        return gap >= ONEDAY_PREP_MINUTES && gap < BREAK_MINUTES;
      });

      return afterRegularTightGap || beforeRegularTightGap || beforeOneDayPrepGap;
    };

    // 90분 수강생에게만 하루 최대 1개의 자동 조율 슬롯을 추가합니다.
    // 기존 버전처럼 “하루에 가능한 일반 슬롯 개수”로 판단하지 않고,
    // 실제 시간표 사이에 90분 수업이 들어갈 수 있는 좁은 틈이 있으면 바로 살립니다.
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

    return NextResponse.json({ slots: available, lesson_minutes: lessonMinutes });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
