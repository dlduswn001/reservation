import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import {
  bookingBlockEndIso,
  bookingBlockEndIsoFromEnd,
  isLessonWithinOperatingHours,
  lessonEndIso,
  normalizeLessonDurationMinutes,
  overlaps,
  regularLessonRule,
  reservationCutoffDate,
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

    const activeBookings = bookings || [];
    const available = (slots || [])
      .filter((slot) => isLessonWithinOperatingHours(slot.start_at, lessonMinutes))
      .filter((slot) => {
        const candidateBlockEndAt = bookingBlockEndIso(slot.start_at, lessonMinutes);
        return !activeBookings.some((booking) => (
          booking.slot_id === slot.id || overlaps(slot.start_at, candidateBlockEndAt, booking.start_at, bookingBlockEndIsoFromEnd(booking.end_at))
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
