import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const studentId = String(body.studentId || "");
    const slotId = String(body.slotId || "");
    if (!studentId || !slotId) {
      return NextResponse.json({ message: "예약 정보가 부족합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: slot, error: slotError } = await supabase
      .from("available_slots")
      .select("id, start_at, end_at, is_open")
      .eq("id", slotId)
      .eq("is_open", true)
      .single();
    if (slotError) throw slotError;

    const { error } = await supabase.from("regular_bookings").insert({
      student_id: studentId,
      slot_id: slot.id,
      start_at: slot.start_at,
      end_at: slot.end_at,
      status: "booked",
      memo: "수강생 직접 예약",
    });
    if (error) {
      if (error.message.includes("duplicate")) {
        return NextResponse.json({ message: "이미 다른 수강생이 예약한 시간입니다." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "오류가 발생했습니다." }, { status: 500 });
  }
}
