import { NextResponse } from "next/server";
import { checkAdminPassword } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function isLocalDateTime(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
}

function localDateTimeToUtcIso(value: string) {
  if (!isLocalDateTime(value)) return "";
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0)).toISOString();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const title = String(body.title || "").trim();
    const memo = String(body.memo || "").trim() || null;
    const startAt = localDateTimeToUtcIso(String(body.start_at || ""));
    const endAt = localDateTimeToUtcIso(String(body.end_at || ""));

    if (!title) {
      return NextResponse.json({ message: "외부 차단 제목을 입력해 주세요." }, { status: 400 });
    }
    if (!startAt || !endAt) {
      return NextResponse.json({ message: "시작 시간과 종료 시간을 올바르게 입력해 주세요." }, { status: 400 });
    }
    if (new Date(startAt).getTime() >= new Date(endAt).getTime()) {
      return NextResponse.json({ message: "종료 시간은 시작 시간 이후여야 합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("blocked_times")
      .insert({ title, start_at: startAt, end_at: endAt, memo })
      .select("id, title, start_at, end_at, memo")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, block: data });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
