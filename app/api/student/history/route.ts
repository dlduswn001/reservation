import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    if (!studentId) return NextResponse.json({ bookings: [] });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("regular_bookings")
      .select("id, start_at, end_at, status, memo, created_at")
      .eq("student_id", studentId)
      .order("start_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ bookings: data || [] });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
