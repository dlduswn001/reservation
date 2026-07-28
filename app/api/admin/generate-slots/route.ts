import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { buildTimetableSlots } from "../../../../lib/businessRules";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    const startDate = String(body.start_date || "");
    const weeks = Number(body.weeks || 8);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return NextResponse.json({ message: "시작 날짜를 선택해 주세요." }, { status: 400 });
    }

    const rows = buildTimetableSlots(startDate, weeks);
    const supabase = getSupabaseAdmin();
    // v20: 같은 날짜의 시간표를 다시 만들 때 기존 행이 있어도 is_open=true로 다시 열어 줍니다.
    // 이전에 만들어진 8월 슬롯이 is_open=false/null 상태로 남아 수강생 화면에 안 뜨는 문제를 막습니다.
    const { data, error } = await supabase
      .from("available_slots")
      .upsert(rows, { onConflict: "start_at", ignoreDuplicates: false })
      .select("id");

    if (error) throw error;
    return NextResponse.json({ ok: true, count: data?.length || 0, attempted: rows.length });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
