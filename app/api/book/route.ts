import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { isAtLeastSixHoursBefore, overlaps } from "../../../lib/businessRules";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const studentId = String(body.studentId || "");
    const slotId = String(body.slotId || "");
    if (!studentId || !slotId) {
      return NextResponse.json({ message: "예약 정보가 부족합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
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

    const { data: existingBookings, error: existingError } = await supabase
      .from("regular_bookings")
      .select("id, slot_id, start_at, end_at, status")
      .in("status", ["booked", "change_request", "cancel_request"]);
    if (existingError) throw existingError;

    const alreadyTaken = (existingBookings || []).some((booking) => (
      booking.slot_id === slot.id || overlaps(slot.start_at, slot.end_at, booking.start_at, booking.end_at)
    ));
    if (alreadyTaken) {
      return NextResponse.json({ message: "이미 다른 수강생이 예약한 시간입니다." }, { status: 409 });
    }

    const { error } = await supabase.from("regular_bookings").insert({
      student_id: studentId,
      slot_id: slot.id,
      start_at: slot.start_at,
      end_at: slot.end_at,
      status: "booked",
      memo: "수강생 직접 예약",
    });
    if (error) {
      if (error.message.includes("duplicate")) {
        return NextResponse.json({ message: "이미 다른 수강생이 예약한 시간입니다." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
