import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { getErrorMessage } from "../../../../lib/supabaseCompat";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noCacheHeaders = { "Cache-Control": "private, no-store, max-age=0" };
const JOURNAL_FIELDS = "id,student_id,booking_id,lesson_date,title,lesson_summary,feedback,homework,private_note,created_at,updated_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: noCacheHeaders });
}

function safeText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!checkAdminPassword(body.password)) {
      return response({ message: getAdminPasswordErrorMessage() }, 401);
    }

    const action = String(body.action || "");
    const studentId = String(body.student_id || "");
    if (!UUID.test(studentId)) return response({ message: "수강생을 선택해 주세요." }, 400);

    const supabase = getSupabaseAdmin();

    if (action === "list") {
      const { data, error } = await supabase
        .from("student_lesson_journals")
        .select(JOURNAL_FIELDS)
        .eq("student_id", studentId)
        .order("lesson_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return response({ journals: data || [] });
    }

    if (action === "delete") {
      const id = String(body.id || "");
      if (!UUID.test(id)) return response({ message: "수업일지를 찾을 수 없습니다." }, 400);
      const { data, error } = await supabase
        .from("student_lesson_journals")
        .delete()
        .eq("id", id).eq("student_id", studentId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return response({ message: "삭제할 수업일지가 없습니다." }, 404);
      return response({ ok: true });
    }

    if (action !== "save") return response({ message: "지원하지 않는 요청입니다." }, 400);

    const id = String(body.id || "");
    const lessonDate = String(body.lesson_date || "");
    const title = safeText(body.title, 180);
    const lessonSummary = safeText(body.lesson_summary, 5000);
    const feedback = safeText(body.feedback, 5000);
    const homework = safeText(body.homework, 3000);
    const privateNote = safeText(body.private_note, 3000);
    const bookingId = String(body.booking_id || "");

    const parsedLessonDay = new Date(lessonDate + "T00:00:00.000Z");
    if (!ISO_DAY.test(lessonDate) || Number.isNaN(parsedLessonDay.getTime()) ||
        parsedLessonDay.toISOString().slice(0,10) !== lessonDate) {
      return response({ message: "수업 날짜를 확인해 주세요." }, 400);
    }
    if (!title || !lessonSummary) {
      return response({ message: "수업명과 오늘 다룬 내용을 입력해 주세요." }, 400);
    }
    if (id && !UUID.test(id)) return response({ message: "수업일지 식별자가 올바르지 않습니다." }, 400);

    if (bookingId) {
      if (!UUID.test(bookingId)) return response({ message: "수업 예약 정보가 올바르지 않습니다." }, 400);
      const { data: booking, error: bookingError } = await supabase
        .from("regular_bookings")
        .select("id,student_id,start_at")
        .eq("id", bookingId).eq("student_id", studentId).maybeSingle();
      if (bookingError) throw bookingError;
      if (!booking) return response({ message: "해당 수강생의 예약을 확인하지 못했습니다." }, 400);
      const kst = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",
      }).formatToParts(new Date(booking.start_at));
      const part = (type: string) => kst.find((p)=>p.type===type)?.value || "";
      const bookingDay = `${part("year")}-${part("month")}-${part("day")}`;
      if (bookingDay !== lessonDate) return response({ message: "선택한 예약과 수업 날짜가 다릅니다." }, 400);
    }

    const fields = {
      student_id: studentId,
      booking_id: bookingId || null,
      lesson_date: lessonDate,
      title, lesson_summary: lessonSummary,
      feedback, homework, private_note: privateNote,
      updated_at: new Date().toISOString(),
    };

    if (action === "save" && id) {
      const { data, error } = await supabase.from("student_lesson_journals")
        .update(fields).eq("id", id).eq("student_id", studentId)
        .select(JOURNAL_FIELDS).maybeSingle();
      if (error) throw error;
      if (!data) return response({ message: "수정할 수업일지가 없습니다." }, 404);
      return response({ ok: true, journal: data });
    }

    const { data, error } = await supabase.from("student_lesson_journals")
      .insert(fields).select(JOURNAL_FIELDS).single();
    if (error) {
      if (error.code === "23505") {
        return response({ message: "이 예약의 수업일지가 이미 있습니다. 기존 일지를 수정해 주세요." }, 409);
      }
      throw error;
    }
    return response({ ok: true, journal: data });
  } catch (error) {
    return response({ message: getErrorMessage(error) }, 500);
  }
}
