import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bookingId = String(body.bookingId || "");
    const studentId = String(body.studentId || "");
    if (!bookingId || !studentId) return NextResponse.json({ message: "정보가 부족합니다." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("regular_bookings")
      .update({ status: "cancel_request", updated_at: new Date().toISOString() })
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
