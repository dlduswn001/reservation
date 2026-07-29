import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../../../lib/supabaseAdmin";

export async function PATCH(request: Request, context: { params: Promise<{ studentId: string }> }) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }
    const { studentId } = await context.params;
    const lessonCredits = Math.max(0, Number(body.lesson_credits || 0));

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("students")
      .update({ lesson_credits: lessonCredits })
      .eq("id", studentId);

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
