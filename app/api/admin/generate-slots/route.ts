import { NextResponse } from "next/server";
import { checkAdminPassword } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { buildTimetableSlots } from "../../../../lib/businessRules";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const startDate = String(body.start_date || "");
    const weeks = Number(body.weeks || 8);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return NextResponse.json({ message: "시작 날짜를 선택해 주세요." }, { status: 400 });
    }

    const rows = buildTimetableSlots(startDate, weeks);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("available_slots")
      .upsert(rows, { onConflict: "start_at", ignoreDuplicates: true })
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
