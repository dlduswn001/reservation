import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../../../lib/supabaseAdmin";

const ALLOWED_STATUSES = new Set(["입금대기", "등록대기", "등록완료", "cancelled"]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ bookingId: string }> }
) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    const { bookingId } = await context.params;
    const nextStatus = String(body.status || "").trim();

    if (!bookingId) {
      return NextResponse.json({ message: "변경할 신청 내역을 찾을 수 없습니다." }, { status: 400 });
    }
    if (!ALLOWED_STATUSES.has(nextStatus)) {
      return NextResponse.json({ message: "변경할 수 없는 신청 상태입니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("oneday_bookings")
      .update({ status: nextStatus })
      .eq("id", bookingId);

    if (error) throw error;

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "원데이 신청 상태를 변경하지 못했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
