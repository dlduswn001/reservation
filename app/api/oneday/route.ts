import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const ACTIVE_STATUSES = ["booked", "입금대기", "등록대기", "입금완료", "등록완료"];
const CAPACITY = 6;
const APPLY_CUTOFF_MS = 3 * 60 * 60 * 1000;

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
      capacity: CAPACITY,
      booked_count: counts.get(c.id) || 0,
      remaining: CAPACITY - (counts.get(c.id) || 0),
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
    const classId = String(body.classId || "").trim();
    const studentName = String(body.student_name || "").trim();
    const last4 = String(body.phone_last4 || "").trim();
    const count = Number(body.people_count);
    if (!classId || !studentName || !/^\\d{4}$/.test(last4) || ![1, 2].includes(count)) {
      return NextResponse.json({ message: "신청 정보를 확인해 주세요." }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("munjang_oneday_join_waitlist", {
      p_class_id: classId, p_student_name: studentName,
      p_phone_last4: last4, p_people_count: count,
    });
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "신청 중 오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
