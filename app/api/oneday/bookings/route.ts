import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

const oneDaySelect = `
  id,
  class_id,
  student_id,
  student_name,
  phone_last4,
  people_count,
  is_regular_student,
  status,
  amount_due,
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = String(searchParams.get("name") || "").trim();
    const phoneLast4 = String(searchParams.get("phoneLast4") || "").trim();

    if (!name || !/^\d{4}$/.test(phoneLast4)) {
      return NextResponse.json(
        { message: "이름과 핸드폰번호 뒷자리 4자리를 정확히 입력해 주세요." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id")
      .eq("name", name)
      .eq("phone_last4", phoneLast4)
      .maybeSingle();

    if (studentError) throw studentError;

    const identityQuery = supabase
      .from("oneday_bookings")
      .select(oneDaySelect)
      .eq("student_name", name)
      .eq("phone_last4", phoneLast4)
      .order("created_at", { ascending: false });

    const queries = [identityQuery];
    if (student?.id) {
      queries.push(
        supabase
          .from("oneday_bookings")
          .select(oneDaySelect)
          .eq("student_id", student.id)
          .order("created_at", { ascending: false }),
      );
    }

    const results = await Promise.all(queries);
    for (const result of results) {
      if (result.error) throw result.error;
    }

    const merged = new Map<string, unknown>();
    for (const result of results) {
      for (const item of result.data || []) {
        if (item && typeof item === "object" && "id" in item) {
          merged.set(String(item.id), item);
        }
      }
    }

    const bookings = Array.from(merged.values()).sort((a, b) => {
      const aClass = (a as { oneday_classes?: { start_at?: string } | null }).oneday_classes;
      const bClass = (b as { oneday_classes?: { start_at?: string } | null }).oneday_classes;
      const aTime = aClass?.start_at ? new Date(aClass.start_at).getTime() : 0;
      const bTime = bClass?.start_at ? new Date(bClass.start_at).getTime() : 0;
      return bTime - aTime;
    });

    // 대기 순번은 해당 수업 대기 신청 전체의 접수 순서로 계산합니다.
    const waitingClassIds = Array.from(new Set(
      bookings.filter((item) => (item as { status?: string }).status === "대기")
        .map((item) => String((item as { class_id?: string }).class_id || "")).filter(Boolean),
    ));
    const queuePositions = new Map<string, number>();
    if (waitingClassIds.length > 0) {
      const { data: queues, error: queueError } = await supabase
        .from("oneday_bookings")
        .select("id, class_id, created_at")
        .in("class_id", waitingClassIds)
        .eq("status", "대기")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (queueError) throw queueError;
      const countByClass = new Map<string, number>();
      for (const item of queues || []) {
        const key = String(item.class_id);
        const position = (countByClass.get(key) || 0) + 1;
        countByClass.set(key, position);
        queuePositions.set(String(item.id), position);
      }
    }
    const items = bookings.map((item) => ({
      ...item,
      waitlist_position: queuePositions.get(String((item as { id: string }).id)) || null,
    }));
    return NextResponse.json({ bookings: items });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "신청 내역을 불러오지 못했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
