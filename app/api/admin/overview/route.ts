import { NextResponse } from "next/server";
import { checkAdminPassword } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { completePastRegularBookings } from "../../../../lib/regularBookingStatus";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    await completePastRegularBookings(supabase);

    const nowIso = new Date().toISOString();

    const [students, slots, bookings, classes, onedayBookings, lessonHistory, blockedTimes] = await Promise.all([
      supabase.from("students").select("id, name, phone_last4, is_active, memo, lesson_credits, lesson_duration_minutes, created_at").order("created_at", { ascending: false }),
      supabase.from("available_slots").select("id, start_at, end_at, is_open, created_at").order("start_at", { ascending: true }),
      supabase.from("regular_bookings").select("id, student_id, slot_id, start_at, end_at, status, memo, created_at, students(name, phone_last4)").order("start_at", { ascending: true }),
      supabase.from("oneday_classes").select("id, title, start_at, end_at, capacity, regular_price, normal_price, description, is_open").eq("is_open", true).gte("start_at", nowIso).order("start_at", { ascending: true }),
      supabase.from("oneday_bookings").select("id, student_name, phone_last4, people_count, is_regular_student, status, amount_due, created_at, oneday_classes(title, start_at, end_at)").order("created_at", { ascending: false }),
      supabase.from("student_lesson_history").select("id, student_id, lesson_date, title, memo, created_at, students(name, phone_last4)").order("lesson_date", { ascending: false }),
      supabase.from("blocked_times").select("id, title, start_at, end_at, memo, created_at").order("start_at", { ascending: true }),
    ]);

    for (const result of [students, slots, bookings, classes, onedayBookings, lessonHistory, blockedTimes]) {
      if (result.error) throw result.error;
    }

    return NextResponse.json({
      students: students.data || [],
      slots: slots.data || [],
      bookings: bookings.data || [],
      classes: classes.data || [],
      onedayBookings: onedayBookings.data || [],
      lessonHistory: lessonHistory.data || [],
      blockedTimes: blockedTimes.data || [],
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
