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
      booked_count: counts.get(c.id) || 0,
      remaining: c.capacity - (counts.get(c.id) || 0),
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

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("oneday_bookings").insert({
      class_id: classId,
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
