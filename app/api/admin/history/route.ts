import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

function errorMessage(error: unknown) {
  return typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message)
    : error instanceof Error
      ? error.message
      : "오류가 발생했습니다.";
}

/**
 * datetime-local 입력값은 시간대 정보가 없습니다.
 * 문장학교 관리자 화면의 입력 시간은 항상 한국 시간(Asia/Seoul)으로 해석합니다.
 */
function kstLocalToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  // 이미 Z 또는 +09:00 같은 시간대가 붙어 있다면 그대로 해석합니다.
  if (/Z$/i.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  // datetime-local 값(YYYY-MM-DDTHH:mm 또는 초 포함)을 한국 시간으로 고정합니다.
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed}:00`
    : trimmed;
  const date = new Date(`${withSeconds}+09:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    const studentId = String(body.student_id || "").trim();
    const title = String(body.title || "").trim();
    const lessonDate = String(body.lesson_date || "").trim();
    const memo = String(body.memo || "").trim();

    if (!studentId || !title || !lessonDate) {
      return NextResponse.json({ message: "수강생, 수업명, 수업 일정을 모두 입력해 주세요." }, { status: 400 });
    }

    const lessonDateIso = kstLocalToIso(lessonDate);
    if (!lessonDateIso) {
      return NextResponse.json({ message: "수업 일정을 정확히 입력해 주세요." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("student_lesson_history").insert({
      student_id: studentId,
      lesson_date: lessonDateIso,
      title,
      memo,
    });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: errorMessage(error) }, { status: 500 });
  }
}
