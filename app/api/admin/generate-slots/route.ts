import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import {
  buildTimetableSlots,
  WEEKDAY_ALL_TIMETABLE_START_TIMES,
  WEEKDAY_REGULAR_START_TIMES,
  DEFAULT_LESSON_MINUTES,
  SHORT_LESSON_MINUTES,
  kstDateTimeToUtcIso,
  addMinutesToIso,
} from "../../../../lib/businessRules";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    // 월·화요일은 자동 생성에서 제외하고 관리자가 지정한 날짜에만 개방합니다.
    if (body.open_weekday_date !== undefined) {
      const dateKey = String(body.open_weekday_date || "");
      const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(dateKey);
      if (!match) {
        return NextResponse.json({ message: "월·화요일 수업 날짜를 선택해 주세요." }, { status: 400 });
      }
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.toISOString().slice(0, 10) !== dateKey || ![1, 2].includes(date.getUTCDay()) || dateKey < "2026-10-01") {
        return NextResponse.json({ message: "2026년 10월 이후의 월요일 또는 화요일만 선택할 수 있습니다." }, { status: 400 });
      }

      const rows = WEEKDAY_ALL_TIMETABLE_START_TIMES.map((time) => {
        const startAt = kstDateTimeToUtcIso(dateKey, time);
        const minutes = WEEKDAY_REGULAR_START_TIMES.includes(time) ? DEFAULT_LESSON_MINUTES : SHORT_LESSON_MINUTES;
        return { start_at: startAt, end_at: addMinutesToIso(startAt, minutes), is_open: true };
      });
      const supabase = getSupabaseAdmin();
      // 슬롯은 재사용하고 기존 regular_bookings 및 students 레코드는 수정하지 않습니다.
      const { data, error } = await supabase
        .from("available_slots")
        .upsert(rows, { onConflict: "start_at", ignoreDuplicates: false })
        .select("id");
      if (error) throw error;
      return NextResponse.json({
        ok: true,
        count: data?.length || 0,
        attempted: rows.length,
        message: `${dateKey} 수업 시간을 수요일과 동일하게 열었습니다.`,
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
