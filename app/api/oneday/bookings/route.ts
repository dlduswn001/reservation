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

    return NextResponse.json({ bookings });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "신청 내역을 불러오지 못했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
