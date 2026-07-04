import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const ACTIVE_STATUSES = ["booked", "입금대기", "등록대기", "입금완료", "등록완료"];
const PAID_ONEDAY_AMOUNT = 10000;

function getSeoulMonthRangeUtc(value: string) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(value));
  const [yearText, monthText] = formatted.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const start = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, -9, 0, 0, 0));
  return { start, end };
}

function getNestedClass(value: unknown): { start_at?: string } | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" ? first as { start_at?: string } : null;
  }
  return value && typeof value === "object" ? value as { start_at?: string } : null;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    const { data: classes, error: classError } = await supabase
      .from("oneday_classes")
      .select("id, title, start_at, end_at, capacity, regular_price, normal_price, description, is_open")
      .eq("is_open", true)
      .gte("start_at", nowIso)
      .order("start_at", { ascending: true });
    if (classError) throw classError;

    const { data: bookings, error: bookingError } = await supabase
      .from("oneday_bookings")
      .select("class_id, people_count, status")
      .in("status", ACTIVE_STATUSES);
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

    if (!classId || !studentName) {
      return NextResponse.json({ message: "신청할 클래스와 이름을 입력해 주세요." }, { status: 400 });
    }
    if (!Number.isFinite(peopleCount) || peopleCount < 1 || peopleCount > 5) {
      return NextResponse.json({ message: "참여 인원은 1명부터 5명까지 입력할 수 있습니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: oneClass, error: classError } = await supabase
      .from("oneday_classes")
      .select("id, start_at, end_at, capacity, is_open")
      .eq("id", classId)
      .eq("is_open", true)
      .single();
    if (classError) throw classError;
    if (!oneClass) {
      return NextResponse.json({ message: "신청 가능한 클래스가 아닙니다." }, { status: 404 });
    }
    if (new Date(oneClass.start_at).getTime() <= Date.now()) {
      return NextResponse.json({ message: "이미 날짜가 지난 원데이 클래스는 신청할 수 없습니다." }, { status: 400 });
    }

    const { data: existingBookings, error: countError } = await supabase
      .from("oneday_bookings")
      .select("people_count, status")
      .eq("class_id", classId)
      .in("status", ACTIVE_STATUSES);
    if (countError) throw countError;

    const bookedCount = (existingBookings || []).reduce((sum, booking) => sum + Number(booking.people_count || 1), 0);
    const capacity = 5;
    const remaining = capacity - bookedCount;
    if (peopleCount > remaining) {
      return NextResponse.json({ message: `남은 자리가 ${remaining}명이라 신청할 수 없습니다.` }, { status: 400 });
    }

    if (!/^\d{4}$/.test(phoneLast4)) {
      return NextResponse.json({ message: "핸드폰번호 뒷자리 4자리를 정확히 입력해 주세요." }, { status: 400 });
    }

    const { data: matchedStudent, error: studentError } = await supabase
      .from("students")
      .select("id")
      .eq("name", studentName)
      .eq("phone_last4", phoneLast4)
      .eq("is_active", true)
      .maybeSingle();
    if (studentError) throw studentError;
    if (!matchedStudent) {
      return NextResponse.json(
        { message: "등록된 정규 수강생 정보를 찾을 수 없습니다. 이름과 핸드폰번호 뒷자리를 확인해 주세요." },
        { status: 403 },
      );
    }

    const { data: studentMonthBookings, error: studentMonthError } = await supabase
      .from("oneday_bookings")
      .select("id, class_id, status, oneday_classes(start_at)")
      .eq("student_id", matchedStudent.id)
      .in("status", ACTIVE_STATUSES);
    if (studentMonthError) throw studentMonthError;

    const duplicate = (studentMonthBookings || []).some((booking) => booking.class_id === classId);
    if (duplicate) {
      return NextResponse.json({ message: "이미 신청한 원데이 클래스입니다. 신청 내역을 확인해 주세요." }, { status: 400 });
    }

    const { start: monthStart, end: monthEnd } = getSeoulMonthRangeUtc(oneClass.start_at);
    const activeThisMonth = (studentMonthBookings || []).filter((booking) => {
      const nestedClass = getNestedClass(booking.oneday_classes);
      if (!nestedClass?.start_at) return false;
      const classTime = new Date(nestedClass.start_at).getTime();
      return classTime >= monthStart.getTime() && classTime < monthEnd.getTime();
    }).length;

    const amountDue = activeThisMonth === 0 ? 0 : PAID_ONEDAY_AMOUNT;
    const nextStatus = amountDue === 0 ? "등록대기" : "입금대기";

    const { error } = await supabase.from("oneday_bookings").insert({
      class_id: classId,
      student_id: matchedStudent.id,
      student_name: studentName,
      phone_last4: phoneLast4,
      people_count: peopleCount,
      is_regular_student: true,
      status: nextStatus,
      amount_due: amountDue,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, amount_due: amountDue, status: nextStatus });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
