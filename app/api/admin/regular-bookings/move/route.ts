import { NextResponse } from "next/server";
import { checkAdminPassword } from "../../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

type TimeRow = {
  id: string;
  title?: string | null;
  start_at: string;
  end_at: string;
  status?: string | null;
};

type RegularBooking = {
  id: string;
  student_id?: string | null;
  slot_id?: string | null;
  start_at: string;
  end_at: string;
  status?: string | null;
};

const ACTIVE_REGULAR_STATUSES = ["booked", "change_request", "cancel_request", "done"];

function isLocalDateTime(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
}

function localDateTimeToUtcIso(value: string) {
  if (!isLocalDateTime(value)) return "";
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0)).toISOString();
}

function formatKstRange(startAt: string, endAt: string) {
  const date = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(startAt));
  const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} ${timeFormatter.format(new Date(startAt))}-${timeFormatter.format(new Date(endAt))}`;
}

function rowLabel(prefix: string, row: TimeRow) {
  const title = row.title ? ` · ${row.title}` : "";
  return `${prefix}${title} / ${formatKstRange(row.start_at, row.end_at)}`;
}

async function maybeFindSlotId(supabase: ReturnType<typeof getSupabaseAdmin>, startAt: string) {
  const { data } = await supabase
    .from("available_slots")
    .select("id")
    .eq("start_at", startAt)
    .maybeSingle();
  return data?.id || null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const bookingId = String(body.booking_id || "").trim();
    const newStartAt = localDateTimeToUtcIso(String(body.new_start_at || ""));
    const newEndAt = localDateTimeToUtcIso(String(body.new_end_at || ""));
    const force = Boolean(body.force);

    if (!bookingId) {
      return NextResponse.json({ message: "변경할 정규수업 예약을 찾지 못했습니다." }, { status: 400 });
    }
    if (!newStartAt || !newEndAt) {
      return NextResponse.json({ message: "변경할 시작 시간과 종료 시간을 올바르게 입력해 주세요." }, { status: 400 });
    }
    if (new Date(newStartAt).getTime() >= new Date(newEndAt).getTime()) {
      return NextResponse.json({ message: "종료 시간은 시작 시간 이후여야 합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: booking, error: bookingError } = await supabase
      .from("regular_bookings")
      .select("id, student_id, slot_id, start_at, end_at, status")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) {
      return NextResponse.json({ message: "정규수업 예약 정보를 찾지 못했습니다." }, { status: 404 });
    }

    const currentBooking = booking as RegularBooking;

    const [regularConflicts, blockConflicts, onedayConflicts] = await Promise.all([
      supabase
        .from("regular_bookings")
        .select("id, start_at, end_at, status")
        .neq("id", bookingId)
        .in("status", ACTIVE_REGULAR_STATUSES)
        .lt("start_at", newEndAt)
        .gt("end_at", newStartAt),
      supabase
        .from("blocked_times")
        .select("id, title, start_at, end_at")
        .lt("start_at", newEndAt)
        .gt("end_at", newStartAt),
      supabase
        .from("oneday_classes")
        .select("id, title, start_at, end_at")
        .eq("is_open", true)
        .lt("start_at", newEndAt)
        .gt("end_at", newStartAt),
    ]);

    for (const result of [regularConflicts, blockConflicts, onedayConflicts]) {
      if (result.error) throw result.error;
    }

    const conflicts = [
      ...((regularConflicts.data || []) as TimeRow[]).map((row) => rowLabel("정규수업", row)),
      ...((blockConflicts.data || []) as TimeRow[]).map((row) => rowLabel("외부차단", row)),
      ...((onedayConflicts.data || []) as TimeRow[]).map((row) => rowLabel("원데이", row)),
    ];

    if (conflicts.length > 0 && !force) {
      return NextResponse.json(
        {
          message: "겹치는 일정이 있습니다. 시간을 다시 선택하거나 강제 변경을 선택해 주세요.",
          conflicts,
        },
        { status: 409 },
      );
    }

    const matchingSlotId = await maybeFindSlotId(supabase, newStartAt);
    const updateWithSlot = {
      start_at: newStartAt,
      end_at: newEndAt,
      slot_id: matchingSlotId,
    };

    let updateResult = await supabase
      .from("regular_bookings")
      .update(updateWithSlot)
      .eq("id", bookingId)
      .select("id, start_at, end_at, status")
      .maybeSingle();

    let slotNotice: string | null = null;

    if (updateResult.error) {
      slotNotice = "slot_id를 함께 변경하지 못해 시간만 변경했습니다.";
      const fallbackResult = await supabase
        .from("regular_bookings")
        .update({ start_at: newStartAt, end_at: newEndAt })
        .eq("id", bookingId)
        .select("id, start_at, end_at, status")
        .maybeSingle();
      updateResult = fallbackResult;
    }

    if (updateResult.error) throw updateResult.error;

    await supabase
      .from("regular_booking_changes")
      .insert({
        booking_id: bookingId,
        old_start_at: currentBooking.start_at,
        old_end_at: currentBooking.end_at,
        new_start_at: newStartAt,
        new_end_at: newEndAt,
        memo: String(body.memo || "").trim() || null,
      });

    return NextResponse.json({
      ok: true,
      booking: updateResult.data,
      message: "정규수업 시간을 변경했습니다.",
      notice: slotNotice,
    });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
