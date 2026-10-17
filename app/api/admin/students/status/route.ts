import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

// Re-enrollment/withdrawal changes ONLY is_active. Bookings, credits and notes are untouched.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }
    const studentId = String(body.student_id || "").trim();
    const isActive = body.is_active;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studentId)
      || typeof isActive !== "boolean") {
      return NextResponse.json({ message: "수강생과 변경할 이용 상태를 확인해 주세요." }, { status: 400 });
    }
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("students")
      .update({ is_active: isActive }).eq("id", studentId)
      .select("id, name, is_active").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ message: "해당 수강생을 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ ok: true, student: data });
  } catch (error) {
    return NextResponse.json({
      message: error instanceof Error ? error.message : "수강 상태를 변경할 수 없습니다.",
    }, { status: 500 });
  }
}
