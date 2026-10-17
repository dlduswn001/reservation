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

    // 대표님이 수동 개방한 4개 날짜는 어떤 월·화 개방/마감 작업에서도 변경하지 않습니다.
    const protectedOctoberDates = new Set(["2026-10-19", "2026-10-20", "2026-10-26", "2026-10-27"]);
    for (const field of ["open_weekday_date", "close_weekday_date"] as const) {
      if (body[field] !== undefined && protectedOctoberDates.has(String(body[field]))) {
        return NextResponse.json({ message: "이 날짜는 기존에 직접 열어둔 보호 일정입니다. 수업 시간과 예약을 변경하지 않습니다." }, { status: 409 });
      }
    }

    // 월·화요일은 명시적으로 연 날짜만 개방하며, 기존 30분 간격의 오래된 슬롯은 일괄 닫습니다.
    // Supabase RPC가 개방 날짜 등록과 5개 정규 시간표 설정을 한 트랜잭션으로 처리합니다.
    if (body.open_weekday_date !== undefined || body.close_weekday_date !== undefined) {
      const opening = body.open_weekday_date !== undefined;
      const dateKey = String(opening ? body.open_weekday_date : body.close_weekday_date);
      const { data, error } = await getSupabaseAdmin().rpc("munjang_set_monday_tuesday_open", {
        p_date_key: dateKey,
        p_is_open: opening,
      });
      if (error) {
        return NextResponse.json({ message: error.message }, { status: 400 });
      }
      return NextResponse.json({
        ...data,
        attempted: opening ? 5 : 0,
        message: opening
          ? dateKey + " 수업을 수요일과 같은 5개 시간(14:00·15:40·17:00·19:00·20:40)으로 열었습니다."
          : dateKey + " 수업을 닫았습니다. 기존 확정 예약은 유지됩니다.",
      });
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
