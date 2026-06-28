import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import {
  bookingBlockEndIso,
  bookingBlockEndIsoFromEnd,
  isAtLeastSixHoursBefore,
  isLessonWithinOperatingHours,
  lessonEndIso,
  normalizeLessonDurationMinutes,
  overlaps,
  regularLessonRule,
} from "../../../lib/businessRules";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const studentId = String(body.studentId || "");
    const slotId = String(body.slotId || "");
    if (!studentId || !slotId) {
      return NextResponse.json({ message: "예약 정보가 부족합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, lesson_credits, lesson_duration_minutes")
      .eq("id", studentId)
      .eq("is_active", true)
      .single();
    if (studentError) throw studentError;

    const currentCredits = Number(student.lesson_credits || 0);
    if (currentCredits <= 0) {
      return NextResponse.json({ message: "잔여 수강권이 없어 예약할 수 없습니다. 관리자에게 문의해 주세요." }, { status: 400 });
    }

    const requestedLessonMinutes = normalizeLessonDurationMinutes(student.lesson_duration_minutes);

    const { data: slot, error: slotError } = await supabase
      .from("available_slots")
      .select("id, start_at, end_at, is_open")
      .eq("id", slotId)
      .eq("is_open", true)
      .single();
    if (slotError) throw slotError;

    if (!isAtLeastSixHoursBefore(slot.start_at)) {
      return NextResponse.json({ message: "수업 시작 6시간 전까지만 예약할 수 있습니다." }, { status: 400 });
    }

    const rule = regularLessonRule(slot.start_at, requestedLessonMinutes);

    if (!isLessonWithinOperatingHours(slot.start_at, requestedLessonMinutes)) {
      return NextResponse.json({ message: "해당 시간은 예약할 수 없습니다. 다른 시간을 선택해 주세요." }, { status: 400 });
    }

    const candidateEndAt = lessonEndIso(slot.start_at, requestedLessonMinutes);
    const candidateBlockEndAt = bookingBlockEndIso(slot.start_at, requestedLessonMinutes);

    const { data: existingBookings, error: existingError } = await supabase
      .from("regular_bookings")
      .select("id, slot_id, start_at, end_at, status")
      .in("status", ["booked", "change_request", "cancel_request"]);
    if (existingError) throw existingError;

    const alreadyTaken = (existingBookings || []).some((booking) => (
      booking.slot_id === slot.id || overlaps(slot.start_at, candidateBlockEndAt, booking.start_at, bookingBlockEndIsoFromEnd(booking.end_at))
    ));
    if (alreadyTaken) {
      return NextResponse.json({ message: "이미 다른 수강생이 예약한 시간입니다." }, { status: 409 });
    }

    const { error } = await supabase.from("regular_bookings").insert({
      student_id: studentId,
      slot_id: slot.id,
      start_at: slot.start_at,
      end_at: candidateEndAt,
      status: "booked",
      memo: `수강생 직접 예약 / ${rule.policyLabel} / ${rule.label} / 수강권 1회 차감`,
    });
    if (error) {
      if (error.message.includes("duplicate")) {
        return NextResponse.json({ message: "이미 다른 수강생이 예약한 시간입니다." }, { status: 409 });
      }
      throw error;
    }

    const { error: creditError } = await supabase
      .from("students")
      .update({ lesson_credits: currentCredits - 1 })
      .eq("id", studentId);
    if (creditError) throw creditError;

    return NextResponse.json({ ok: true, lesson_credits: currentCredits - 1 });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
