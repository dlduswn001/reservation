import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

type RegularBookingRow = {
  id: string;
  student_id?: string | null;
  slot_id?: string | null;
  start_at: string;
  end_at: string;
  status: string;
  memo?: string | null;
  students?: {
    name?: string | null;
    phone_last4?: string | null;
    lesson_credits?: number | null;
    lesson_duration_minutes?: number | null;
  } | null;
};

type OneDayClassRow = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  capacity?: number | null;
  regular_price?: number | null;
  normal_price?: number | null;
  description?: string | null;
  is_open?: boolean | null;
};

type OneDayBookingRow = {
  id: string;
  class_id?: string | null;
  student_name?: string | null;
  phone_last4?: string | null;
  people_count?: number | null;
  is_regular_student?: boolean | null;
  status?: string | null;
  amount_due?: number | null;
  created_at?: string | null;
};

type BlockedTimeRow = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  memo?: string | null;
};

type AvailableSlotRow = {
  id: string;
  start_at: string;
  end_at: string;
  is_open?: boolean | null;
};

type ScheduleItem = {
  id: string;
  type: "regular" | "oneday" | "block" | "available";
  title: string;
  subtitle: string;
  start_at: string;
  end_at: string;
  status?: string;
  memo?: string | null;
  sortOrder: number;
  meta?: Record<string, unknown>;
};

const ACTIVE_ONEDAY_STATUSES = new Set(["booked", "입금대기", "등록대기", "입금완료", "등록완료"]);
const CONFIRMED_ONEDAY_STATUSES = new Set(["입금완료", "등록완료"]);
const ACTIVE_REGULAR_STATUSES = ["booked", "change_request", "cancel_request", "done"];

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function seoulDateToUtcIso(value: string, plusDays = 0) {
  if (!isIsoDate(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + plusDays, -9, 0, 0, 0)).toISOString();
}

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return new Date(startA).getTime() < new Date(endB).getTime()
    && new Date(endA).getTime() > new Date(startB).getTime();
}

function peopleCount(row: OneDayBookingRow) {
  const value = Number(row.people_count || 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function money(value: number | null | undefined) {
  const safeValue = Number(value || 0);
  return `${safeValue.toLocaleString("ko-KR")}원`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    const startDate = String(body.start_date || "").trim();
    const endDate = String(body.end_date || "").trim();

    if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
      return NextResponse.json({ message: "조회 시작일과 종료일을 올바르게 선택해 주세요." }, { status: 400 });
    }

    const startAt = seoulDateToUtcIso(startDate, 0);
    const endAt = seoulDateToUtcIso(endDate, 1);

    if (new Date(startAt).getTime() >= new Date(endAt).getTime()) {
      return NextResponse.json({ message: "종료일은 시작일 이후여야 합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    const [regularBookings, onedayClasses, blockedTimes, availableSlots] = await Promise.all([
      supabase
        .from("regular_bookings")
        .select("id, student_id, slot_id, start_at, end_at, status, memo, students(name, phone_last4, lesson_credits, lesson_duration_minutes)")
        .lt("start_at", endAt)
        .gt("end_at", startAt)
        .in("status", ACTIVE_REGULAR_STATUSES)
        .order("start_at", { ascending: true }),
      supabase
        .from("oneday_classes")
        .select("id, title, start_at, end_at, capacity, regular_price, normal_price, description, is_open")
        .eq("is_open", true)
        .lt("start_at", endAt)
        .gt("end_at", startAt)
        .order("start_at", { ascending: true }),
      supabase
        .from("blocked_times")
        .select("id, title, start_at, end_at, memo")
        .lt("start_at", endAt)
        .gt("end_at", startAt)
        .order("start_at", { ascending: true }),
      supabase
        .from("available_slots")
        .select("id, start_at, end_at, is_open")
        .eq("is_open", true)
        .gte("start_at", nowIso)
        .gte("start_at", startAt)
        .lt("start_at", endAt)
        .order("start_at", { ascending: true })
        .limit(700),
    ]);

    for (const result of [regularBookings, onedayClasses, blockedTimes, availableSlots]) {
      if (result.error) throw result.error;
    }

    const classes = (onedayClasses.data || []) as OneDayClassRow[];
    const classIds = classes.map((item) => item.id);

    let onedayBookings: OneDayBookingRow[] = [];
    if (classIds.length > 0) {
      const bookingResult = await supabase
        .from("oneday_bookings")
        .select("id, class_id, student_name, phone_last4, people_count, is_regular_student, status, amount_due, created_at")
        .in("class_id", classIds);
      if (bookingResult.error) throw bookingResult.error;
      onedayBookings = (bookingResult.data || []) as OneDayBookingRow[];
    }

    const items: ScheduleItem[] = [];

    for (const booking of (regularBookings.data || []) as RegularBookingRow[]) {
      const studentName = booking.students?.name || "이름 없음";
      const detailText = [
        booking.students?.phone_last4 ? `휴대폰 뒷자리 ${booking.students.phone_last4}` : "",
        booking.students?.lesson_duration_minutes ? `${booking.students.lesson_duration_minutes}분 수업` : "",
        typeof booking.students?.lesson_credits === "number" ? `잔여 ${booking.students.lesson_credits}회` : "",
      ].filter(Boolean).join(" / ");

      items.push({
        id: `regular-${booking.id}`,
        type: "regular",
        title: `정규수업 · ${studentName}`,
        subtitle: detailText || "정규수업 예약",
        start_at: booking.start_at,
        end_at: booking.end_at,
        status: booking.status,
        memo: booking.memo,
        sortOrder: 10,
        meta: {
          booking_id: booking.id,
          student_id: booking.student_id,
          slot_id: booking.slot_id,
          student_name: studentName,
          phone_last4: booking.students?.phone_last4 || null,
          lesson_credits: booking.students?.lesson_credits ?? null,
          lesson_duration_minutes: booking.students?.lesson_duration_minutes ?? null,
        },
      });
    }

    for (const klass of classes) {
      const activeBookings = onedayBookings.filter((booking) => booking.class_id === klass.id && ACTIVE_ONEDAY_STATUSES.has(String(booking.status || "")));
      const confirmedBookings = activeBookings.filter((booking) => CONFIRMED_ONEDAY_STATUSES.has(String(booking.status || "")));
      const activePeople = activeBookings.reduce((sum, booking) => sum + peopleCount(booking), 0);
      const confirmedPeople = confirmedBookings.reduce((sum, booking) => sum + peopleCount(booking), 0);
      const capacity = Number(klass.capacity || 5);

      items.push({
        id: `oneday-${klass.id}`,
        type: "oneday",
        title: `원데이 · ${klass.title}`,
        subtitle: `신청 ${activePeople}명 / 등록확정 ${confirmedPeople}명 / 정원 ${capacity}명`,
        start_at: klass.start_at,
        end_at: klass.end_at,
        status: klass.is_open ? "open" : "closed",
        memo: klass.description || null,
        sortOrder: 20,
        meta: {
          class_id: klass.id,
          capacity,
          active_people: activePeople,
          confirmed_people: confirmedPeople,
          regular_price: klass.regular_price ?? null,
          normal_price: klass.normal_price ?? null,
          price_label: `정규 ${money(klass.regular_price)} / 일반 ${money(klass.normal_price)}`,
        },
      });
    }

    for (const block of (blockedTimes.data || []) as BlockedTimeRow[]) {
      items.push({
        id: `block-${block.id}`,
        type: "block",
        title: `외부차단 · ${block.title}`,
        subtitle: block.memo || "외부 예약, 상담, 개인 일정 등으로 막아둔 시간",
        start_at: block.start_at,
        end_at: block.end_at,
        memo: block.memo || null,
        sortOrder: 30,
        meta: {
          block_id: block.id,
        },
      });
    }

    const busyItems = items.filter((item) => item.type !== "available");
    for (const slot of (availableSlots.data || []) as AvailableSlotRow[]) {
      const isBusy = busyItems.some((busy) => overlaps(slot.start_at, slot.end_at, busy.start_at, busy.end_at));
      if (isBusy) continue;
      items.push({
        id: `available-${slot.id}`,
        type: "available",
        title: "예약 가능",
        subtitle: "정규수업 예약 가능 시간",
        start_at: slot.start_at,
        end_at: slot.end_at,
        status: "open",
        sortOrder: 40,
        meta: {
          slot_id: slot.id,
        },
      });
    }

    items.sort((a, b) => {
      const timeDiff = new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.sortOrder - b.sortOrder;
    });

    const summary = {
      regular_count: items.filter((item) => item.type === "regular").length,
      oneday_count: items.filter((item) => item.type === "oneday").length,
      block_count: items.filter((item) => item.type === "block").length,
      available_count: items.filter((item) => item.type === "available").length,
      oneday_booking_people: onedayBookings
        .filter((booking) => ACTIVE_ONEDAY_STATUSES.has(String(booking.status || "")))
        .reduce((sum, booking) => sum + peopleCount(booking), 0),
    };

    return NextResponse.json({
      ok: true,
      range: {
        start_date: startDate,
        end_date: endDate,
        start_at: startAt,
        end_at: endAt,
      },
      summary,
      items,
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
