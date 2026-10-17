import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function lessonDateIso(value: unknown) {
  const raw = String(value || "").trim();
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(raw)) return null;
  const date = new Date(raw + ":00+09:00");
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function clean(value: unknown, max = 12000) {
  return String(value || "").trim().slice(0, max);
}
function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "수강일지를 처리하지 못했습니다.";
  return NextResponse.json({ message }, { status: 500 });
}

// All operations are administrator authenticated. Diaries never appear in student APIs.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }
    const db = getSupabaseAdmin();
    const action = String(body.action || "list");
    const studentId = clean(body.student_id, 80);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)) {
      return NextResponse.json({ message: "수강생을 선택해 주세요." }, { status: 400 });
    }

    if (action === "list") {
      const { data, error } = await db.from("student_lesson_diaries")
        .select("id,student_id,lesson_at,title,lesson_notes,feedback,homework,message_text,delivery_status,sent_at,created_at,updated_at")
        .eq("student_id", studentId)
        .order("lesson_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return NextResponse.json({ diaries: data || [] }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "save") {
      const id = clean(body.id, 80);
      const title = clean(body.title, 180);
      const lessonAt = lessonDateIso(body.lesson_at);
      const lessonNotes = clean(body.lesson_notes);
      const feedback = clean(body.feedback);
      const homework = clean(body.homework);
      const messageText = clean(body.message_text, 5000);
      if (!title || !lessonAt) {
        return NextResponse.json({ message: "수업 날짜와 수업명을 입력해 주세요." }, { status: 400 });
      }
      const record = {
        title, lesson_at: lessonAt,
        lesson_notes: lessonNotes, feedback, homework,
        message_text: messageText, updated_at: new Date().toISOString(),
      };
      if (id) {
        const { data, error } = await db.from("student_lesson_diaries")
          .update(record)
          .eq("id", id)
          .eq("student_id", studentId)
          .eq("delivery_status", "draft")
          .select("id").maybeSingle();
        if (error) throw error;
        if (!data) return NextResponse.json({ message: "수정 가능한 수강일지를 찾지 못했습니다." }, { status: 404 });
        return NextResponse.json({ ok: true, id: data.id });
      }
      const { data, error } = await db.from("student_lesson_diaries")
        .insert({ student_id: studentId, ...record })
        .select("id").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id });
    }

    if (action === "delete") {
      const id = clean(body.id, 80);
      if (!id) return NextResponse.json({ message: "삭제할 일지를 선택해 주세요." }, { status: 400 });
      const { data, error } = await db.from("student_lesson_diaries")
        .delete().eq("id", id).eq("student_id", studentId)
        .eq("delivery_status", "draft").select("id").maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ message: "삭제 가능한 수강일지를 찾지 못했습니다." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ message: "지원하지 않는 요청입니다." }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
