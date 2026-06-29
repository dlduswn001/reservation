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

    // 90분 수강생에게만 하루 최대 1개의 자동 조율 슬롯을 추가합니다.
    // 일반 30분 슬롯으로는 하루 3명 운영이 어려워지는 날에, 10분 단위 후보 중 가장 이른 시간을 제안합니다.
    if (lessonMinutes === 90) {
      for (const dateKey of dateKeys) {
        const existingRegularCount = activeBookings.filter((booking) => dateKeyInKst(new Date(booking.start_at)) === dateKey).length;
        const normalCount = (normalStartsByDate.get(dateKey)?.size || 0);
        if (existingRegularCount + normalCount >= 3) continue;

        const candidates = buildAdjustmentSlotStartTimesForDate(dateKey, isSaturdayDateKey(dateKey));
        const validCandidates = candidates
          .filter((startAt) => isSlotAvailable({ start_at: startAt }, true))
          .filter((startAt) => {
            // 가까운 일반 30분 슬롯이 이미 가능하면 화면을 복잡하게 만들지 않습니다.
            const startMs = new Date(startAt).getTime();
            return !(normalAvailable || []).some((slot) => {
              if (dateKeyInKst(new Date(slot.start_at)) !== dateKey) return false;
              return Math.abs(new Date(slot.start_at).getTime() - startMs) <= 20 * 60 * 1000;
            });
          });

        const chosen = validCandidates[0];
        if (!chosen) continue;
        const rule = regularLessonRule(chosen, lessonMinutes);
        autoAdjustmentSlots.push({
          id: autoAdjustmentSlotId(chosen),
          start_at: chosen,
          end_at: lessonEndIso(chosen, lessonMinutes),
          lesson_minutes: rule.lessonMinutes,
          break_minutes: 20,
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
