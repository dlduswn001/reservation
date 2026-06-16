import { NextResponse } from "next/server";
import { checkAdminPassword } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function errorMessage(error: unknown) {
  return typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message)
    : error instanceof Error
      ? error.message
      : "오류가 발생했습니다.";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const studentId = String(body.student_id || "").trim();
    const title = String(body.title || "").trim();
    const lessonDate = String(body.lesson_date || "").trim();
    const memo = String(body.memo || "").trim();

    if (!studentId || !title || !lessonDate) {
      return NextResponse.json({ message: "수강생, 수업명, 수업 일정을 모두 입력해 주세요." }, { status: 400 });
    }

    const parsedDate = new Date(lessonDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ message: "수업 일정을 정확히 입력해 주세요." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("student_lesson_history").insert({
      student_id: studentId,
      lesson_date: parsedDate.toISOString(),
      title,
      memo,
    });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: errorMessage(error) }, { status: 500 });
  }
}
