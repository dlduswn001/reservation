import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const ACTIVE_STATUSES = new Set(["booked", "입금대기", "등록대기", "입금완료", "등록완료"]);
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function getClassInfo(value: unknown): { start_at?: string; end_at?: string; title?: string } | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? first as { start_at?: string; end_at?: string; title?: string } : null;
  }
  return value && typeof value === "object"
    ? value as { start_at?: string; end_at?: string; title?: string }
    : null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bookingId = String(body.bookingId || "").trim();
    const name = String(body.student_name || "").trim();
    const phoneLast4 = String(body.phone_last4 || "").trim();

    if (!bookingId || !name || !/^\d{4}$/.test(phoneLast4)) {
      return NextResponse.json(
        { message: "신청 내역과 본인 확인 정보를 정확히 입력해 주세요." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: booking, error: bookingError } = await supabase
      .from("oneday_bookings")
      .select(`
        id,
        student_id,
        student_name,
        phone_last4,
        status,
        oneday_classes (
          title,
          start_at,
          end_at
        )
      `)
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) {
      return NextResponse.json({ message: "신청 내역을 찾을 수 없습니다." }, { status: 404 });
    }

    let identityMatches = booking.student_name === name && booking.phone_last4 === phoneLast4;
    if (!identityMatches && booking.student_id) {
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("id")
        .eq("id", booking.student_id)
        .eq("name", name)
        .eq("phone_last4", phoneLast4)
        .maybeSingle();
      if (studentError) throw studentError;
      identityMatches = Boolean(student);
    }

    if (!identityMatches) {
      return NextResponse.json({ message: "신청자 정보가 일치하지 않습니다." }, { status: 403 });
    }

    if (!ACTIVE_STATUSES.has(String(booking.status || ""))) {
      return NextResponse.json({ message: "이미 취소되었거나 취소할 수 없는 신청입니다." }, { status: 400 });
    }

    const oneClass = getClassInfo(booking.oneday_classes);
    if (!oneClass?.start_at) {
      return NextResponse.json({ message: "원데이 클래스 일정을 확인할 수 없습니다." }, { status: 400 });
    }

    const now = Date.now();
    const startTime = new Date(oneClass.start_at).getTime();
    if (!Number.isFinite(startTime)) {
      return NextResponse.json({ message: "원데이 클래스 시간이 올바르지 않습니다." }, { status: 400 });
    }

    if (startTime <= now) {
      return NextResponse.json({ message: "이미 시작했거나 종료된 원데이 클래스는 취소할 수 없습니다." }, { status: 400 });
    }

    if (startTime - now < SIX_HOURS_MS) {
      return NextResponse.json({ message: "원데이 클래스는 수업 시작 6시간 전까지만 취소할 수 있습니다." }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("oneday_bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingId)
      .in("status", ["booked", "입금대기", "등록대기", "입금완료", "등록완료"]);

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      message: "원데이 클래스 신청이 취소되었습니다.",
    });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "취소 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
