import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { toKstDateTimeLocal } from "../../../../lib/time";

function getRouteErrorMessage(error: unknown) {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  if (error instanceof Error) return error.message;
  return "오류가 발생했습니다.";
}

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

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ message: "시간 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (endDate <= startDate) {
      return NextResponse.json({ message: "종료 시간은 시작 시간보다 늦어야 합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // v23: 일요일처럼 자동 생성되지 않는 시간도 관리자가 직접 열 수 있도록 upsert 처리합니다.
    // 이미 같은 시작 시간이 있으면 에러로 막지 않고 다시 is_open=true로 열어 둡니다.
    const { data, error } = await supabase
      .from("available_slots")
      .upsert(
        {
          start_at: startAt,
          end_at: endAt,
          is_open: true,
        },
        { onConflict: "start_at" }
      )
      .select("id, start_at, end_at, is_open")
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      slot: data,
      message: "예약 가능 시간이 등록되었습니다.",
    });
  } catch (error) {
    return NextResponse.json({ message: getRouteErrorMessage(error) }, { status: 500 });
  }
}
