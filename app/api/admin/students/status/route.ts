import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { getErrorMessage } from "../../../../../lib/supabaseCompat";

export const dynamic = "force-dynamic";
const STUDENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = ["active", "paused", "withdrawn", "auto"];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body?.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }
    const studentId = String(body.student_id || "");
    const status = String(body.status || "");
    if (!STUDENT_ID.test(studentId) || !ALLOWED.includes(status)) {
      return NextResponse.json({ message: "수강생과 변경할 상태를 확인해 주세요." }, { status: 400 });
    }

    const manualEnrollmentStatus = status === "auto" ? null : status;
    const { data, error } = await getSupabaseAdmin().from("students")
      .update({
        manual_enrollment_status: manualEnrollmentStatus,
        is_active: status !== "withdrawn",
      })
      .eq("id", studentId)
      .select("id,manual_enrollment_status,is_active")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ message: "수강생을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, student: data }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error) }, { status: 500 });
  }
}
