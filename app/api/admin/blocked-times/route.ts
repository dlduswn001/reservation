import { NextResponse } from "next/server";
import { checkAdminPassword } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function seoulLocalToUtcIso(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  const normalized = value.trim();
  if (normalized.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(normalized)) {
    return new Date(normalized).toISOString();
  }
  const [datePart, timePart = "00:00"] = normalized.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute || 0, 0, 0)).toISOString();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const title = String(body.title || "").trim();
    const memo = String(body.memo || "").trim();
    const startAt = seoulLocalToUtcIso(body.start_at);
    const endAt = seoulLocalToUtcIso(body.end_at);

    if (!title) {
      return NextResponse.json({ message: "차단 사유를 입력해 주세요." }, { status: 400 });
    }
    if (!startAt || !endAt || new Date(startAt).getTime() >= new Date(endAt).getTime()) {
      return NextResponse.json({ message: "시작 시간과 종료 시간을 올바르게 입력해 주세요." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("blocked_times").insert({
      title,
      memo,
      start_at: startAt,
      end_at: endAt,
    });
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
