import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function toIsoFromLocal(value: string) {
  if (!value) return "";
  if (value.includes("T") && !value.endsWith("Z") && !value.includes("+")) {
    return new Date(`${value}:00+09:00`).toISOString();
  }
  return new Date(value).toISOString();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    const title = String(body.title || "").trim();
    const curriculum = String(body.curriculum || "").trim();
    const startAtRaw = String(body.start_at || "").trim();
    const endAtRaw = String(body.end_at || "").trim();
    const regularPrice = Number(body.regular_price || 0);
    const normalPrice = Number(body.normal_price || 0);
    const capacity = 6;

    if (!title || !startAtRaw || !endAtRaw) {
      return NextResponse.json({ message: "제목, 수업 시작 일정, 수업 종료 일정을 입력해 주세요." }, { status: 400 });
    }

    const start_at = toIsoFromLocal(startAtRaw);
    const end_at = toIsoFromLocal(endAtRaw);

    if (Number.isNaN(new Date(start_at).getTime()) || Number.isNaN(new Date(end_at).getTime())) {
      return NextResponse.json({ message: "수업 일정을 올바르게 입력해 주세요." }, { status: 400 });
    }
    if (new Date(end_at).getTime() <= new Date(start_at).getTime()) {
      return NextResponse.json({ message: "수업 종료 일정은 시작 일정 이후여야 합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("oneday_classes").insert({
      title,
      start_at,
      end_at,
      capacity,
      regular_price: regularPrice,
      normal_price: normalPrice,
      description: curriculum,
      is_open: true,
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
