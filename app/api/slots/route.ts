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
    const available = (slots || [])
      .filter((slot) => isLessonWithinOperatingHours(slot.start_at, lessonMinutes))
      .filter((slot) => {
        const candidateEndAt = lessonEndIso(slot.start_at, lessonMinutes);
        return !conflictsWithOneDayBlocks(slot.start_at, candidateEndAt, activeOnedayBlocks);
      })
      .filter((slot) => {
        const candidateEndAt = lessonEndIso(slot.start_at, lessonMinutes);
        return !overlapsAnyTimeBlock(slot.start_at, candidateEndAt, activeBlockedTimes);
      })
      .filter((slot) => {
        const candidateEndAt = lessonEndIso(slot.start_at, lessonMinutes);
        return !activeBookings.some((booking) => (
          booking.slot_id === slot.id || conflictsWithRegularBookings(slot.start_at, candidateEndAt, [{ start_at: booking.start_at, end_at: booking.end_at }])
        ));
      })
      .map((slot) => ({
        ...slot,
        end_at: lessonEndIso(slot.start_at, lessonMinutes),
        lesson_minutes: regularLessonRule(slot.start_at, lessonMinutes).lessonMinutes,
        break_minutes: regularLessonRule(slot.start_at, lessonMinutes).breakMinutes,
        rule_label: regularLessonRule(slot.start_at, lessonMinutes).label,
      }));

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
