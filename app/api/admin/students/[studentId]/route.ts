import { NextResponse } from "next/server";
import { checkAdminPassword } from "../../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

function errorMessage(error: unknown) {
  return typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message)
    : error instanceof Error
      ? error.message
      : "오류가 발생했습니다.";
}

export async function PATCH(request: Request, context: { params: Promise<{ studentId: string }> }) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const { studentId } = await context.params;
    const name = String(body.name || "").trim();
    const phoneLast4 = String(body.phone_last4 || "").trim();
    const memo = String(body.memo || "").trim();
    const lessonCredits = Number(body.lesson_credits ?? 0);
    const isActive = body.is_active !== false;

    if (!name || !/^\d{4}$/.test(phoneLast4)) {
      return NextResponse.json({ message: "이름과 핸드폰번호 뒷자리 4자리를 정확히 입력해 주세요." }, { status: 400 });
    }
    if (!Number.isFinite(lessonCredits) || lessonCredits < 0) {
      return NextResponse.json({ message: "수강권 횟수는 0 이상의 숫자로 입력해 주세요." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("students")
      .update({
        name,
        phone_last4: phoneLast4,
        memo,
        lesson_credits: Math.floor(lessonCredits),
        is_active: isActive,
      })
      .eq("id", studentId);

    if (error) {
      if (error.message.toLowerCase().includes("duplicate")) {
        return NextResponse.json({ message: "같은 이름과 전화번호 뒷자리로 등록된 수강생이 이미 있습니다." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ studentId: string }> }) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }
    const { studentId } = await context.params;
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("students")
      .delete()
      .eq("id", studentId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: errorMessage(error) }, { status: 500 });
  }
}
