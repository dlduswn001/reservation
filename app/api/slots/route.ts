import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { bookingBlockEndIso, overlaps, reservationCutoffDate } from "../../../lib/businessRules";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const cutoff = reservationCutoffDate().toISOString();

    const { data: slots, error: slotsError } = await supabase
      .from("available_slots")
      .select("id, start_at, end_at")
      .eq("is_open", true)
      .gt("start_at", cutoff)
      .order("start_at", { ascending: true });
    if (slotsError) throw slotsError;

    const { data: bookings, error: bookingsError } = await supabase
      .from("regular_bookings")
      .select("id, slot_id, start_at, end_at, status")
      .in("status", ["booked", "change_request", "cancel_request"]);
    if (bookingsError) throw bookingsError;

    const activeBookings = bookings || [];
    const available = (slots || []).filter((slot) => {
      return !activeBookings.some((booking) => (
        booking.slot_id === slot.id || overlaps(slot.start_at, bookingBlockEndIso(slot.start_at), booking.start_at, bookingBlockEndIso(booking.start_at))
      ));
    });

    return NextResponse.json({ slots: available });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
