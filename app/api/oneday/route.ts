import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: classes, error: classError } = await supabase
      .from("oneday_classes")
      .select("id, title, start_at, end_at, capacity, regular_price, normal_price, description, is_open")
      .eq("is_open", true)
      .order("start_at", { ascending: true });
    if (classError) throw classError;

    const { data: bookings, error: bookingError } = await supabase
      .from("oneday_bookings")
      .select("class_id, people_count, status")
      .in("status", ["booked", "입금대기", "입금완료"]);
    if (bookingError) throw bookingError;

    const counts = new Map<string, number>();
    for (const b of bookings || []) {
      counts.set(b.class_id, (counts.get(b.class_id) || 0) + (b.people_count || 1));
    }

    const withRemaining = (classes || []).map((c) => ({
      ...c,
      capacity: 5,
      booked_count: counts.get(c.id) || 0,
      remaining: 5 - (counts.get(c.id) || 0),
    }));

    return NextResponse.json({ classes: withRemaining });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const classId = String(body.classId || "");
    const studentName = String(body.student_name || "").trim();
    const phoneLast4 = String(body.phone_last4 || "").trim();
    const peopleCount = Number(body.people_count || 1);
    const isRegularStudent = Boolean(body.is_regular_student);

    if (!classId || !studentName) {
      return NextResponse.json({ message: "신청할 클래스와 이름을 입력해 주세요." }, { status: 400 });
    }
    if (!Number.isFinite(peopleCount) || peopleCount < 1 || peopleCount > 5) {
      return NextResponse.json({ message: "참여 인원은 1명부터 5명까지 입력할 수 있습니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: oneClass, error: classError } = await supabase
      .from("oneday_classes")
      .select("id, capacity, is_open")
      .eq("id", classId)
      .eq("is_open", true)
      .single();
    if (classError) throw classError;
    if (!oneClass) {
      return NextResponse.json({ message: "신청 가능한 클래스가 아닙니다." }, { status: 404 });
    }

    const { data: existingBookings, error: countError } = await supabase
      .from("oneday_bookings")
      .select("people_count, status")
      .eq("class_id", classId)
      .in("status", ["booked", "입금대기", "입금완료"]);
    if (countError) throw countError;

    const bookedCount = (existingBookings || []).reduce((sum, booking) => sum + Number(booking.people_count || 1), 0);
    const capacity = 5;
    const remaining = capacity - bookedCount;
    if (peopleCount > remaining) {
      return NextResponse.json({ message: `남은 자리가 ${remaining}명이라 신청할 수 없습니다.` }, { status: 400 });
    }

    let matchedStudentId: string | null = null;
    if (studentName && phoneLast4) {
      const { data: matchedStudent, error: studentError } = await supabase
        .from("students")
        .select("id")
        .eq("name", studentName)
        .eq("phone_last4", phoneLast4)
        .eq("is_active", true)
        .maybeSingle();
      if (studentError) throw studentError;
      matchedStudentId = matchedStudent?.id || null;
    }

    const { error } = await supabase.from("oneday_bookings").insert({
      class_id: classId,
      student_id: matchedStudentId,
      student_name: studentName,
      phone_last4: phoneLast4,
      people_count: peopleCount,
      is_regular_student: isRegularStudent,
      status: "booked",
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
