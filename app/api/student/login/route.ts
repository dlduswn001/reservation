import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const phoneLast4 = String(body.phone_last4 || "").trim();

    if (!name || !phoneLast4) {
      return NextResponse.json({ message: "이름과 핸드폰번호 뒷자리 4자리를 입력해 주세요." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("students")
      .select("id, name, phone_last4")
      .eq("name", name)
      .eq("phone_last4", phoneLast4)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ message: "입력하신 정보와 일치하는 수강생을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ student: data });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
