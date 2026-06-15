import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: slots, error: slotsError } = await supabase
      .from("available_slots")
      .select("id, start_at, end_at")
      .eq("is_open", true)
      .order("start_at", { ascending: true });
    if (slotsError) throw slotsError;

    const { data: bookings, error: bookingsError } = await supabase
      .from("regular_bookings")
      .select("slot_id")
      .in("status", ["booked", "change_request"]);
    if (bookingsError) throw bookingsError;

    const taken = new Set((bookings || []).map((b) => b.slot_id));
    const available = (slots || []).filter((slot) => !taken.has(slot.id));
    return NextResponse.json({ slots: available });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "오류가 발생했습니다." }, { status: 500 });
  }
}
