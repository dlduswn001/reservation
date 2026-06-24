import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { isAtLeastSixHoursBefore } from "../../../lib/businessRules";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bookingId = String(body.bookingId || "");
    const studentId = String(body.studentId || "");
    if (!bookingId || !studentId) {
      return NextResponse.json({ message: "정보가 부족합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: booking, error: findError } = await supabase
      .from("regular_bookings")
      .select("id, student_id, start_at, end_at, status")
      .eq("id", bookingId)
      .eq("student_id", studentId)
      .maybeSingle();

    if (findError) throw findError;
    if (!booking) {
      return NextResponse.json({ message: "예약 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    const now = Date.now();
    const startTime = new Date(booking.start_at).getTime();
    const endTime = new Date(booking.end_at).getTime();

    // 종료 시간이 지난 예약은 수강 완료로 확정하고 취소를 막습니다.
    if (endTime <= now || booking.status === "done") {
      if (booking.status !== "done") {
        await supabase
          .from("regular_bookings")
          .update({ status: "done", updated_at: new Date().toISOString() })
          .eq("id", bookingId)
          .in("status", ["booked", "change_request"]);
      }

      return NextResponse.json(
        { message: "이미 수강 완료된 수업은 취소할 수 없습니다." },
        { status: 409 }
      );
    }

    // 수업이 시작된 뒤에는 종료 전이라도 취소할 수 없습니다.
    if (startTime <= now) {
      return NextResponse.json(
        { message: "이미 시작된 수업은 취소할 수 없습니다." },
        { status: 409 }
      );
    }

    if (booking.status !== "booked") {
      return NextResponse.json(
        { message: "현재 상태에서는 이 예약을 취소할 수 없습니다." },
        { status: 409 }
      );
    }

    const isEarlyCancel = isAtLeastSixHoursBefore(booking.start_at);
    const nextStatus = isEarlyCancel ? "cancelled" : "late_cancelled";
    const nextMemo = isEarlyCancel
      ? "수강생 직접 취소 / 수업 6시간 전 취소로 수강권 1회 복구"
      : "수강생 직접 취소 / 수업 6시간 이내 취소로 수강권 차감 유지";

    const { error } = await supabase
      .from("regular_bookings")
      .update({ status: nextStatus, updated_at: new Date().toISOString(), memo: nextMemo })
      .eq("id", bookingId)
      .eq("student_id", studentId)
      .eq("status", "booked");
    if (error) throw error;

    let nextCredits: number | null = null;
    if (isEarlyCancel) {
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("lesson_credits")
        .eq("id", studentId)
        .single();
      if (studentError) throw studentError;
      nextCredits = Number(student.lesson_credits || 0) + 1;
      const { error: creditError } = await supabase
        .from("students")
        .update({ lesson_credits: nextCredits })
        .eq("id", studentId);
      if (creditError) throw creditError;
    }

    return NextResponse.json({
      ok: true,
      early_cancel: isEarlyCancel,
      lesson_credits: nextCredits,
      message: isEarlyCancel
        ? "예약이 취소되었습니다. 수강권 1회가 복구되었습니다."
        : "예약이 취소되었습니다. 수업 6시간 이내 취소라 수강권은 차감된 상태로 유지됩니다.",
    });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
