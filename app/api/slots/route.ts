import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import {
  isLessonWithinOperatingHours,
  lessonEndIso,
  normalizeLessonDurationMinutes,
  getReservationLessonMinutes,
  getReservationCreditCost,
  isLifestyleLessonSlot,
  EXTENDED_LESSON_MINUTES,
  conflictsWithOneDayBlocks,
  conflictsWithRegularBookings,
  reservationCutoffDate,
  overlapsAnyTimeBlock,
  WEEKDAY_VISIBLE_TIMETABLE_START_TIMES,
} from "../../../lib/businessRules";
import { canBookWithRegularPassPolicy, getRegularPassPolicyStatus, type RegularPassPolicyStudent } from "../../../lib/passPolicy";
import { getErrorMessage, isMissingPassColumnError } from "../../../lib/supabaseCompat";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SlotRow = {
  id: string;
  start_at: string;
  end_at?: string | null;
  is_open?: boolean | null;
};

type AvailableMonth = {
  key: string;
  year: number;
  month: number;
  count: number;
};

function kstParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

function isSundayKst(value: string) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(new Date(value));

  return weekday === "Sun";
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonth(year: number, month: number, amount: number) {
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function normalizeRequestedMonthKey(value: string | null) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [year, month] = raw.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return monthKey(year, month);
}

function kstDateTimeToIso(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second, millisecond)).toISOString();
}

function kstMonthKeyFromIso(value: string) {
  const parts = kstParts(new Date(value));
  return monthKey(parts.year, parts.month);
}

function buildSearchRange(cutoffDate: Date) {
  const cutoffParts = kstParts(cutoffDate);
  const currentKey = monthKey(cutoffParts.year, cutoffParts.month);
  const next = addMonth(cutoffParts.year, cutoffParts.month, 1);
  const nextKey = monthKey(next.year, next.month);
  const afterNext = addMonth(cutoffParts.year, cutoffParts.month, 2);
  const afterNextKey = monthKey(afterNext.year, afterNext.month);
  const afterNextLastDay = daysInMonth(afterNext.year, afterNext.month);

  return {
    rangeStartIso: cutoffDate.toISOString(),
    rangeEndIso: kstDateTimeToIso(afterNext.year, afterNext.month, afterNextLastDay, 23, 59, 59, 999),
    currentMonthKey: currentKey,
    nextMonthKey: nextKey,
    afterNextMonthKey: afterNextKey,
    preferNextMonth: cutoffParts.day >= 25,
  };
}

function monthInfoFromKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  return { key, year, month };
}

function buildMonthRangeIso(key: string) {
  const [year, month] = key.split("-").map(Number);
  const lastDay = daysInMonth(year, month);
  return {
    start: kstDateTimeToIso(year, month, 1, 0, 0, 0, 0),
    end: kstDateTimeToIso(year, month, lastDay, 23, 59, 59, 999),
  };
}

function countByMonth<T extends { start_at: string }>(rows: T[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = kstMonthKeyFromIso(row.start_at);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function monthListFromCountMap(map: Map<string, number>) {
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ ...monthInfoFromKey(key), count }));
}

async function loadAvailableSlots(supabase: ReturnType<typeof getSupabaseAdmin>, rangeStartIso: string, rangeEndIso: string) {
  // 기존 DB마다 is_open 컬럼 적용 시점이 달라 로그인/예약 화면이 막히지 않도록 두 번 시도합니다.
  const withOpen = await supabase
    .from("available_slots")
    .select("id, start_at, end_at, is_open")
    .gte("start_at", rangeStartIso)
    .lte("start_at", rangeEndIso)
    .order("start_at", { ascending: true })
    .limit(3000);

  if (!withOpen.error) return { data: (withOpen.data || []) as SlotRow[], usedFallback: false };

  const message = String(withOpen.error.message || "").toLowerCase();
  const isMissingOpenColumn = message.includes("is_open") || message.includes("schema cache") || message.includes("column");
  if (!isMissingOpenColumn) throw withOpen.error;

  const withoutOpen = await supabase
    .from("available_slots")
    .select("id, start_at, end_at")
    .gte("start_at", rangeStartIso)
    .lte("start_at", rangeEndIso)
    .order("start_at", { ascending: true })
    .limit(3000);

  if (withoutOpen.error) throw withoutOpen.error;
  return { data: (withoutOpen.data || []) as SlotRow[], usedFallback: true };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");
    const requestedMonthKey = normalizeRequestedMonthKey(searchParams.get("month"));
    const supabase = getSupabaseAdmin();
    const cutoffDate = reservationCutoffDate();
    const cutoff = cutoffDate.toISOString();
    const searchRange = buildSearchRange(cutoffDate);

    const requestedLessonMinutes = Number(searchParams.get("lessonMinutes") || 0);
    let lessonMinutes = normalizeLessonDurationMinutes(
      Number.isFinite(requestedLessonMinutes) && requestedLessonMinutes > 0 ? requestedLessonMinutes : null,
    );

    let studentPassPolicy: RegularPassPolicyStudent | null = null;
    let studentPassStatus: ReturnType<typeof getRegularPassPolicyStatus> | null = null;

    if (studentId) {
      let studentResult = await supabase
        .from("students")
        .select("lesson_duration_minutes, pass_registered_at, pass_first_lesson_at, pass_expires_at, pass_extension_until")
        .eq("id", studentId)
        .maybeSingle();

      if (studentResult.error && isMissingPassColumnError(studentResult.error)) {
        studentResult = await supabase
          .from("students")
          .select("lesson_duration_minutes")
          .eq("id", studentId)
          .maybeSingle();
      }

      if (studentResult.error) throw studentResult.error;
      const student = studentResult.data;
      if (!requestedLessonMinutes) {
        lessonMinutes = normalizeLessonDurationMinutes(student?.lesson_duration_minutes);
      }
      if (student && "pass_registered_at" in student) {
        studentPassPolicy = student;
        studentPassStatus = getRegularPassPolicyStatus(student);
      }
    }

    if (lessonMinutes === EXTENDED_LESSON_MINUTES) {
      return NextResponse.json(
        {
          slots: [],
          lesson_minutes: lessonMinutes,
          requires_direct_scheduling: true,
          kakao_chat_url: "http://pf.kakao.com/_xcxbGwn/chat",
          message: "120분 수업은 문장학교 카카오톡 채널로 직접 일정을 조율해 주세요.",
          available_months: [],
          raw_months: [],
          pass_policy: studentPassStatus,
          debug: { version: "v36", note: "120분 수강생은 앱 자동예약 대신 직접 조율 안내를 표시합니다." },
        },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            Pragma: "no-cache",
            Expires: "0",
          },
        },
      );
    }

    const slotLoad = await loadAvailableSlots(supabase, searchRange.rangeStartIso, searchRange.rangeEndIso);

    // v22 핵심: 다음 달 시간표가 있는데 is_open 값 때문에 통째로 숨는 일을 막기 위해
    // 예약 가능 시간은 실제로 삭제된 행만 제외하고, 불러온 행 전체를 후보로 봅니다.
    // 관리자에서 예약 가능 시간을 삭제하면 행 자체가 삭제되므로 이 방식이 안전합니다.
    const slots = slotLoad.data;
    const rawMonthCountMap = countByMonth(slots);
    const rawMonths = monthListFromCountMap(rawMonthCountMap);

    const { data: bookings, error: bookingsError } = await supabase
      .from("regular_bookings")
      .select("id, slot_id, start_at, end_at, status")
      .in("status", ["booked", "change_request", "cancel_request"])
      .gte("end_at", cutoff)
      .lte("start_at", searchRange.rangeEndIso);
    if (bookingsError) throw bookingsError;

    const { data: onedayClasses, error: onedayError } = await supabase
      .from("oneday_classes")
      .select("id, start_at, end_at, is_open")
      .gte("end_at", cutoff)
      .lte("start_at", searchRange.rangeEndIso);
    if (onedayError) throw onedayError;

    const { data: blockedTimes, error: blockedError } = await supabase
      .from("blocked_times")
      .select("id, start_at, end_at")
      .gte("end_at", cutoff)
      .lte("start_at", searchRange.rangeEndIso);
    if (blockedError) throw blockedError;

    // 월·화요일은 날짜별 관리자 수동 개방 기록이 있어야만 표시합니다.
    // 오래전에 자동 생성된 is_open=true 행만으로는 휴무일이 열리지 않습니다.
    const { data: openedDates, error: openedDatesError } = await supabase
      .from("regular_weekday_open_dates")
      .select("date_key");
    if (openedDatesError) throw openedDatesError;
    const explicitlyOpened = new Set((openedDates || []).map((date) => String(date.date_key)));

    const activeBookings = bookings || [];
    const activeOnedayBlocks = (onedayClasses || []).filter((klass: any) => klass.is_open !== false);
    const activeBlockedTimes = blockedTimes || [];

    const isSlotAvailable = (slot: SlotRow) => {
      // 월·화요일은 관리자가 열어 둔 DB 슬롯만 노출합니다.
      // 수·목·금은 기존 is_open 처리 방식을 유지합니다.
      const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        weekday: "short",
      }).format(new Date(slot.start_at));
      if (["Mon", "Tue"].includes(weekday)) {
        // 10월에 관리자가 직접 개방한 네 날짜의 기존 표시 동작은 바꾸지 않습니다.
        const dateKey = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(new Date(slot.start_at));
        const protectedDates = ["2026-10-19", "2026-10-20", "2026-10-26", "2026-10-27"];
        if (protectedDates.includes(dateKey)) {
          if (slot.is_open === false) return false;
        } else {
          const timeKey = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
          }).format(new Date(slot.start_at));
          if (slot.is_open !== true || !explicitlyOpened.has(dateKey)
            || !WEEKDAY_VISIBLE_TIMETABLE_START_TIMES.includes(timeKey)) return false;
        }
      }

      const slotLessonMinutes = getReservationLessonMinutes(slot.start_at, lessonMinutes);

      // 월·화요일도 수요일과 같은 시작 시간만 표시합니다.
      // 실제 DB에 등록된 시간만 조회하므로 미개방 날짜는 예약할 수 없습니다.
      if (!isLessonWithinOperatingHours(slot.start_at, slotLessonMinutes)) {
        return false;
      }

      const candidateEndAt = lessonEndIso(slot.start_at, slotLessonMinutes);
      if (studentPassPolicy && !canBookWithRegularPassPolicy(studentPassPolicy, slot.start_at).ok) return false;
      if (conflictsWithOneDayBlocks(slot.start_at, candidateEndAt, activeOnedayBlocks)) return false;
      if (overlapsAnyTimeBlock(slot.start_at, candidateEndAt, activeBlockedTimes)) return false;

      return true;
    };
    const isRegularOccupied = (slot: SlotRow) => {
      const duration = getReservationLessonMinutes(slot.start_at, lessonMinutes);
      const end = lessonEndIso(slot.start_at, duration);
      return activeBookings.some((booking) => (
        (slot.id && booking.slot_id === slot.id)
        || conflictsWithRegularBookings(slot.start_at, end, [{ start_at: booking.start_at, end_at: booking.end_at }])
      ));
    };

    const available = slots
      .filter((slot) => isSlotAvailable(slot) && !isRegularOccupied(slot))
      .map((slot) => {
        const slotLessonMinutes = getReservationLessonMinutes(slot.start_at, lessonMinutes);
        const isLifestyle = isLifestyleLessonSlot(slot.start_at);
        return {
          id: slot.id,
          start_at: slot.start_at,
          end_at: lessonEndIso(slot.start_at, slotLessonMinutes),
          lesson_minutes: slotLessonMinutes,
          break_minutes: isLifestyle ? 0 : 30,
          credit_cost: getReservationCreditCost(slot.start_at, lessonMinutes),
          is_lifestyle: isLifestyle,
          rule_label: isLifestyle
            ? `${slotLessonMinutes}분 1:1 서평생활/필사생활 · 수강권 ${getReservationCreditCost(slot.start_at, lessonMinutes)}회 차감`
            : `${slotLessonMinutes}분 정규수업 · 수강권 1회 차감`,
        };
      })
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    // 예약이 찬 정규수업 시간은 신청 대신 대기 버튼을 표시합니다.
    // 운영 시간·월화 개방·수강권 이용기간·원데이/외부 일정 조건은 기존 예약과 동일하게 적용합니다.
    const waitingSlots = slots
      .filter((slot) => isSlotAvailable(slot) && isRegularOccupied(slot))
      .map((slot) => {
        const duration = getReservationLessonMinutes(slot.start_at, lessonMinutes);
        const lifestyle = isLifestyleLessonSlot(slot.start_at);
        return {
          id: slot.id,
          start_at: slot.start_at,
          end_at: lessonEndIso(slot.start_at, duration),
          lesson_minutes: duration,
          credit_cost: getReservationCreditCost(slot.start_at, lessonMinutes),
          is_lifestyle: lifestyle,
          rule_label: lifestyle
            ? `${duration}분 1:1 서평생활/필사생활 · 대기 신청`
            : `${duration}분 정규수업 · 대기 신청`,
          is_waitlist: true,
        };
      });

    const availableMonthCountMap = countByMonth(available);
    const availableMonths: AvailableMonth[] = monthListFromCountMap(availableMonthCountMap);

    const hasRequestedMonthSlots = Boolean(requestedMonthKey && availableMonthCountMap.has(requestedMonthKey));
    const hasCurrentMonthSlots = availableMonthCountMap.has(searchRange.currentMonthKey);
    const hasNextMonthSlots = availableMonthCountMap.has(searchRange.nextMonthKey);
    const hasCurrentRawSlots = rawMonthCountMap.has(searchRange.currentMonthKey);
    const hasNextRawSlots = rawMonthCountMap.has(searchRange.nextMonthKey);

    let visibleMonthKey = requestedMonthKey && hasRequestedMonthSlots
      ? requestedMonthKey
      : searchRange.currentMonthKey;

    if (!requestedMonthKey) {
      if (hasCurrentMonthSlots || hasCurrentRawSlots) {
        visibleMonthKey = searchRange.currentMonthKey;
      } else if (hasNextMonthSlots || hasNextRawSlots) {
        visibleMonthKey = searchRange.nextMonthKey;
      } else if (availableMonths[0]) {
        visibleMonthKey = availableMonths[0].key;
      } else if (rawMonths[0]) {
        visibleMonthKey = rawMonths[0].key;
      }
    }

    // 이번 달 남은 일정이 있으면 8월 말에도 8월을 먼저 보이게 하되,
    // 9월 일정도 같은 화면 아래쪽에 같이 표시합니다.
    // 사용자가 9월 일정을 관리자 페이지에서 미리 열어두면, 8월 27일 이후에도 8월 남은 일정 아래에 9월 일정이 함께 보입니다.
    const visibleMonthKeys = Array.from(new Set([
      searchRange.currentMonthKey,
      searchRange.nextMonthKey,
    ]));

    const visibleAvailable = available.filter((slot) => visibleMonthKeys.includes(kstMonthKeyFromIso(slot.start_at)));
    const visibleMonth = monthInfoFromKey(visibleMonthKey);
    const visibleRange = buildMonthRangeIso(visibleMonthKey);

    return NextResponse.json(
      {
        slots: visibleAvailable,
        waitlist_slots: waitingSlots.filter((slot) => visibleMonthKeys.includes(kstMonthKeyFromIso(slot.start_at))),
        lesson_minutes: lessonMinutes,
        open_month: {
          ...visibleMonth,
          range_start_at: visibleMonthKey === searchRange.currentMonthKey ? searchRange.rangeStartIso : visibleRange.start,
          range_end_at: visibleRange.end,
          mode: requestedMonthKey && hasRequestedMonthSlots
            ? "requested_month"
            : searchRange.preferNextMonth && visibleMonthKey === searchRange.nextMonthKey
              ? "next_month_forced"
              : "auto_month",
        },
        available_months: availableMonths.length > 0 ? availableMonths : rawMonths,
        raw_months: rawMonths,
        pass_policy: studentPassStatus,
        debug: {
          version: "v36",
          raw_slot_count: slots.length,
          available_slot_count: available.length,
          returned_slot_count: visibleAvailable.length,
          current_month_key: searchRange.currentMonthKey,
          next_month_key: searchRange.nextMonthKey,
          after_next_month_key: searchRange.afterNextMonthKey,
          requested_month_key: requestedMonthKey,
          selected_month_key: visibleMonthKey,
          available_month_keys: availableMonths.map((month) => month.key),
          raw_month_keys: rawMonths.map((month) => month.key),
          used_slot_select_fallback: slotLoad.usedFallback,
          note: "v36은 45분/90분 정규수강권과 120분 직접 조율 방식을 반영합니다.",
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error), version: "v36" }, { status: 500 });
  }
}
