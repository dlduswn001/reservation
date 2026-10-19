import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { completePastRegularBookings } from "../../../../lib/regularBookingStatus";
import { getErrorMessage, isMissingPassColumnError } from "../../../../lib/supabaseCompat";

function isMissingDeletedColumn(error: unknown) {
  const message = typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message)
    : error instanceof Error
      ? error.message
      : String(error || "");
  return message.includes("is_deleted") || message.includes("column");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    await completePastRegularBookings(supabase);

    const classesQuery = supabase
      .from("oneday_classes")
      .select("id, title, start_at, end_at, capacity, regular_price, normal_price, description, is_open, is_deleted")
      // Keep soft-deleted classes in the admin calendar as historical records.
      // The public/student list remains limited to is_open=true classes.
      .order("start_at", { ascending: true });

    let students: any = await supabase
      .from("students")
      .select("id, name, phone_last4, is_active, credits_zero_since, last_credit_refill_at, memo, lesson_credits, lesson_duration_minutes, pass_registered_at, pass_first_lesson_at, pass_expires_at, pass_extension_used, pass_extension_until, pass_extension_reason, created_at")
      .order("created_at", { ascending: false });

    if (students.error && isMissingPassColumnError(students.error)) {
      students = await supabase
        .from("students")
        .select("id, name, phone_last4, is_active, memo, lesson_credits, lesson_duration_minutes, created_at")
        .order("created_at", { ascending: false });
    }

    const [slots, bookings, classesResult, onedayBookings, lessonHistory, blockedTimes, statuses, registrations, privateContacts, bookingTuitions, blockedTimeTuitions] = await Promise.all([
      supabase.from("available_slots").select("id, start_at, end_at, is_open, created_at").order("start_at", { ascending: true }),
      supabase.from("regular_bookings").select("id, student_id, slot_id, start_at, end_at, status, memo, created_at, students(name, phone_last4)").order("start_at", { ascending: true }),
      classesQuery,
      supabase.from("oneday_bookings").select("id, class_id, student_name, phone_last4, people_count, is_regular_student, status, amount_due, created_at, oneday_classes(id, title, start_at, end_at)").order("created_at", { ascending: false }),
      supabase.from("student_lesson_history").select("id, student_id, lesson_date, title, memo, created_at, students(name, phone_last4)").order("lesson_date", { ascending: false }),
      supabase.from("blocked_times").select("id, title, start_at, end_at, memo, created_at").order("start_at", { ascending: true }),
      supabase.rpc("munjang_admin_student_statuses"),
      supabase.from("student_registration_payments")
        .select("id,student_id,payment_date,registration_type,amount_krw,credits_added,memo,created_at")
        .order("payment_date",{ascending:false}).limit(1000),
      supabase.from("student_private_contacts")
        .select("student_id,phone_number"),
      supabase.from("booking_tuition")
        .select("booking_id,student_minutes,lesson_minutes,amount_krw,confirmed_at,memo,updated_at"),
      supabase.from("blocked_time_tuition")
        .select("block_id,amount_krw,confirmed_at,memo,updated_at"),
    ]);

    for (const result of [students, slots, bookings, onedayBookings, lessonHistory, blockedTimes, statuses, registrations, privateContacts, bookingTuitions]) {
      if (result.error) throw result.error;
    }

    // Optional add-on table: keep existing reservation administration usable if
    // the additive migration is not yet applied.
    const missingBlockedTuitionTable = Boolean(blockedTimeTuitions.error) &&
      (["42P01", "PGRST205", "PGRST116"].includes(String(blockedTimeTuitions.error?.code || ""))
        || /blocked_time_tuition/.test(String(blockedTimeTuitions.error?.message || "")));
    if (blockedTimeTuitions.error && !missingBlockedTuitionTable) throw blockedTimeTuitions.error;

    let classes: Record<string, unknown>[] = classesResult.data || [];
    if (classesResult.error) {
      if (!isMissingDeletedColumn(classesResult.error)) throw classesResult.error;
      const fallbackClasses = await supabase
        .from("oneday_classes")
        .select("id, title, start_at, end_at, capacity, regular_price, normal_price, description, is_open")
        .eq("is_open", true)
        .order("start_at", { ascending: true });
      if (fallbackClasses.error) throw fallbackClasses.error;
      classes = fallbackClasses.data || [];
    }

    return NextResponse.json({
      students: (students.data || []).map((student: Record<string, unknown>) => {
        const status = (statuses.data || []).find((row: {student_id:string}) => row.student_id===student.id);
        return {
          ...student,
          phone_number: (privateContacts.data || []).find((row:{student_id:string})=>row.student_id===student.id)?.phone_number || null,
          enrollment_status: status?.enrollment_status || (student.is_active === false ? "withdrawn" : "active"),
          last_attended_at: status?.last_attended_at || null,
          credits_zero_since: status?.credits_zero_since || student.credits_zero_since || null,
        };
      }),
      registrations: registrations.data || [],
      bookingTuitions: bookingTuitions.data || [],
      blockedTimeTuitions: missingBlockedTuitionTable ? [] : (blockedTimeTuitions.data || []),
      slots: slots.data || [],
      bookings: bookings.data || [],
      classes,
      onedayBookings: onedayBookings.data || [],
      lessonHistory: lessonHistory.data || [],
      blockedTimes: blockedTimes.data || [],
    });
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error) }, { status: 500 });
  }
}
