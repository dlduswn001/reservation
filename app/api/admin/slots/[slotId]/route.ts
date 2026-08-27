import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export async function DELETE(request: Request, context: { params: Promise<{ slotId: string }> }) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    const { slotId } = await context.params;
    if (!slotId) {
      return NextResponse.json({ message: "삭제할 예약 가능 시간 정보가 없습니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: linkedBookings, error: bookingError } = await supabase
      .from("regular_bookings")
      .select("id, status")
      .eq("slot_id", slotId)
      .limit(1);
    if (bookingError) throw bookingError;

    if ((linkedBookings || []).length > 0) {
      return NextResponse.json(
        { message: "이미 예약 기록이 연결된 시간은 삭제할 수 없습니다. 예약 기록을 보존하기 위해 삭제를 막았습니다." },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from("available_slots")
      .delete()
      .eq("id", slotId);

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
