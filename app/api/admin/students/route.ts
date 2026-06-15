import { NextResponse } from "next/server";
import { checkAdminPassword } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const name = String(body.name || "").trim();
    const phoneLast4 = String(body.phone_last4 || "").trim();
    const memo = String(body.memo || "").trim();
    if (!name || !phoneLast4) {
      return NextResponse.json({ message: "이름과 핸드폰번호 뒷자리 4자리를 입력해 주세요." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("students").insert({
      name,
      phone_last4: phoneLast4,
      memo,
      is_active: true,
    });

    if (error) {
      if (error.message.includes("duplicate")) {
        return NextResponse.json({ message: "이미 등록된 수강생입니다." }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "오류가 발생했습니다." }, { status: 500 });
  }
}
