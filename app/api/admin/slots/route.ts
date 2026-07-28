import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { toKstDateTimeLocal } from "../../../../lib/time";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    const startAt = toKstDateTimeLocal(String(body.start_at || ""));
    const endAt = toKstDateTimeLocal(String(body.end_at || ""));
    if (!startAt || !endAt) {
      return NextResponse.json({ message: "시작 시간과 종료 시간을 입력해 주세요." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("available_slots").insert({
      start_at: startAt,
      end_at: endAt,
      is_open: true,
    });

    if (error) {
      if (error.message.includes("duplicate")) {
        return NextResponse.json({ message: "이미 등록된 예약 가능 시간입니다." }, { status: 409 });
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
