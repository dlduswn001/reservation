import { NextResponse } from "next/server";
import { checkAdminPassword } from "../../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export async function DELETE(request: Request, context: { params: Promise<{ blockId: string }> }) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const { blockId } = await context.params;
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("blocked_times").delete().eq("id", blockId);
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
