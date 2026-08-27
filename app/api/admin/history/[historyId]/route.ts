import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

function errorMessage(error: unknown) {
  return typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message)
    : error instanceof Error
      ? error.message
      : "오류가 발생했습니다.";
}

/** 관리자 화면의 datetime-local 입력은 항상 한국 시간으로 해석합니다. */
function kstLocalToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/Z$/i.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed}:00`
    : trimmed;
  const date = new Date(`${withSeconds}+09:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export async function PATCH(request: Request, context: { params: Promise<{ historyId: string }> }) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    const { historyId } = await context.params;
    const title = String(body.title || "").trim();
    const lessonDate = String(body.lesson_date || "").trim();
    const memo = String(body.memo || "").trim();

    if (!title || !lessonDate) {
      return NextResponse.json({ message: "수업명과 수업 일정을 입력해 주세요." }, { status: 400 });
    }

    const lessonDateIso = kstLocalToIso(lessonDate);
    if (!lessonDateIso) {
      return NextResponse.json({ message: "수업 일정을 정확히 입력해 주세요." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("student_lesson_history")
      .update({ title, lesson_date: lessonDateIso, memo })
      .eq("id", historyId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ historyId: string }> }) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    const { historyId } = await context.params;
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("student_lesson_history").delete().eq("id", historyId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: errorMessage(error) }, { status: 500 });
  }
}
