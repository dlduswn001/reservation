import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const ACTIVE_STATUSES = new Set(["booked", "입금대기", "등록대기", "입금완료", "등록완료"]);
// 수업 당일에는 취소할 수 없습니다. 날짜 계산은 한국 시간을 기준으로 합니다.
function seoulDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

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
    const phone = String(body.phone_last4 || "").trim();
    if (!bookingId || !name || !/^\\d{4}$/.test(phone)) {
      return NextResponse.json({ message: "신청자 정보를 확인해 주세요." }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("munjang_oneday_cancel_and_promote", {
      p_booking_id: bookingId, p_student_name: name, p_phone_last4: phone,
    });
    if (error) throw error;
    return NextResponse.json({ ...data, message: "원데이 클래스 신청이 취소되었습니다." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "취소 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
