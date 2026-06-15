import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { isAtLeastSixHoursBefore } from "../../../lib/businessRules";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bookingId = String(body.bookingId || "");
    const studentId = String(body.studentId || "");
    if (!bookingId || !studentId) return NextResponse.json({ message: "정보가 부족합니다." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: booking, error: findError } = await supabase
      .from("regular_bookings")
      .select("id, student_id, start_at, end_at, status")
      .eq("id", bookingId)
      .eq("student_id", studentId)
      .eq("status", "booked")
      .single();
    if (findError) throw findError;

    if (!isAtLeastSixHoursBefore(booking.start_at)) {
      return NextResponse.json({ message: "수업 시작 6시간 전까지만 취소할 수 있습니다." }, { status: 400 });
    }

    const { error } = await supabase
      .from("regular_bookings")
      .update({ status: "cancelled", updated_at: new Date().toISOString(), memo: "수강생 직접 취소" })
      .eq("id", bookingId)
      .eq("student_id", studentId);
    if (error) throw error;

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
