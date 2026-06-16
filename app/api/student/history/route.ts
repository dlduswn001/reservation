import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    if (!studentId) {
      return NextResponse.json({ bookings: [], manualHistory: [], onedayBookings: [] });
    }

    const supabase = getSupabaseAdmin();

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, name, phone_last4")
      .eq("id", studentId)
      .maybeSingle();

    if (studentError) throw studentError;
    if (!student) {
      return NextResponse.json({ message: "수강생 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    const oneDaySelect = `
      id,
      class_id,
      student_id,
      student_name,
      phone_last4,
      people_count,
      is_regular_student,
      status,
      created_at,
      oneday_classes (
        id,
        title,
        start_at,
        end_at,
        regular_price,
        normal_price,
        description
      )
    `;

    const [bookings, manualHistory, onedayByStudentId, onedayByIdentity] = await Promise.all([
      supabase
        .from("regular_bookings")
        .select("id, start_at, end_at, status, memo, created_at")
        .eq("student_id", studentId)
        .order("start_at", { ascending: false }),
      supabase
        .from("student_lesson_history")
        .select("id, lesson_date, title, memo, created_at")
        .eq("student_id", studentId)
        .order("lesson_date", { ascending: false }),
      supabase
        .from("oneday_bookings")
        .select(oneDaySelect)
        .eq("student_id", studentId)
        .order("created_at", { ascending: false }),
      supabase
        .from("oneday_bookings")
        .select(oneDaySelect)
        .eq("student_name", student.name)
        .eq("phone_last4", student.phone_last4)
        .order("created_at", { ascending: false }),
    ]);

    if (bookings.error) throw bookings.error;
    if (manualHistory.error) throw manualHistory.error;
    if (onedayByStudentId.error) throw onedayByStudentId.error;
    if (onedayByIdentity.error) throw onedayByIdentity.error;

    const mergedOneDay = new Map<string, unknown>();
    for (const item of [...(onedayByStudentId.data || []), ...(onedayByIdentity.data || [])]) {
      if (item && typeof item === "object" && "id" in item) {
        mergedOneDay.set(String(item.id), item);
      }
    }

    const onedayBookings = Array.from(mergedOneDay.values()).sort((a, b) => {
      const aClass = (a as { oneday_classes?: { start_at?: string } | null }).oneday_classes;
      const bClass = (b as { oneday_classes?: { start_at?: string } | null }).oneday_classes;
      const aTime = aClass?.start_at ? new Date(aClass.start_at).getTime() : 0;
      const bTime = bClass?.start_at ? new Date(bClass.start_at).getTime() : 0;
      return bTime - aTime;
    });

    return NextResponse.json({
      bookings: bookings.data || [],
      manualHistory: manualHistory.data || [],
      onedayBookings,
    });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
