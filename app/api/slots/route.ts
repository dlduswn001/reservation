import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import {
  isLessonWithinOperatingHours,
  lessonEndIso,
  normalizeLessonDurationMinutes,
  getReservationLessonMinutes,
  getReservationCreditCost,
  isLifestyleLessonSlot,
  isOfficialClassStartTime,
  EXTENDED_LESSON_MINUTES,
  conflictsWithOneDayBlocks,
  conflictsWithRegularBookings,
  reservationCutoffDate,
  overlapsAnyTimeBlock,
  WEEKDAY_VISIBLE_TIMETABLE_START_TIMES,
  WEEKEND_REGULAR_START_TIMES,
  WEEKEND_REGULAR_START_TIMES_45,
  WEEKEND_LIFESTYLE_START_TIMES,
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
          debug: { version: "v39", note: "120분 수강생은 앱 자동예약 대신 직접 조율 안내를 표시합니다." },
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

    // 당일 시작 3시간 전이 지나서 신청/대기가 모두 닫힌 시간도 '마감'으로 표시합니다.
    // 전날 수업은 노출하지 않고 오늘 00:00 KST부터 읽습니다.
    const todayParts = kstParts(new Date());
    const todayStart = kstDateTimeToIso(todayParts.year, todayParts.month, todayParts.day);
    const slotLoad = await loadAvailableSlots(supabase, todayStart, searchRange.rangeEndIso);

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

    const slotDateKey = (startAt: string) => {
      const parts = kstParts(new Date(startAt));
      return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    };
    const slotWeekday = (startAt: string) => new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul", weekday: "short",
    }).format(new Date(startAt));
    const protectedDates = new Set(["2026-10-19", "2026-10-20", "2026-10-26", "2026-10-27"]);

    const isAllowedLessonDateAndTime = (slot: SlotRow) => {
      // Never expose legacy 30-minute weekend/weekday starts from old slot data.
      if (!isOfficialClassStartTime(slot.start_at)) return false;
      const dateKey = slotDateKey(slot.start_at);
      const weekday = slotWeekday(slot.start_at);
      if (["Mon", "Tue"].includes(weekday) && !protectedDates.has(dateKey)) {
        const timeKey = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
        }).format(new Date(slot.start_at));
        if (!explicitlyOpened.has(dateKey) || !WEEKDAY_VISIBLE_TIMETABLE_START_TIMES.includes(timeKey)) {
          return false;
        }
      }
      const duration = getReservationLessonMinutes(slot.start_at, lessonMinutes);
      if (!isLessonWithinOperatingHours(slot.start_at, duration)) return false;
      if (studentPassPolicy && !canBookWithRegularPassPolicy(studentPassPolicy, slot.start_at).ok) return false;
      return true;
    };

    const isSlotAvailable = (slot: SlotRow) => {
      if (!isAllowedLessonDateAndTime(slot)) return false;
      // 닫힌 슬롯과 예약 시작 3시간 전을 넘긴 시간은 예약과 대기 모두 불가능합니다.
      if (slot.is_open === false || new Date(slot.start_at).getTime() <= cutoffDate.getTime()) return false;

      const slotLessonMinutes = getReservationLessonMinutes(slot.start_at, lessonMinutes);
      const candidateEndAt = lessonEndIso(slot.start_at, slotLessonMinutes);
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

    // 수업 운영일의 기존 시간표는 '예약하기 / 대기 신청 / 마감'으로 상태를 분리합니다.
    // 월·화 정규 휴무일 및 관리자 미개방 날짜는 시간표 자체를 표시하지 않습니다.
    const activeClassDateKeys = new Set(
      slots.filter((slot) => slot.is_open === true && isAllowedLessonDateAndTime(slot))
        .map((slot) => slotDateKey(slot.start_at)),
    );
    const closedSlots = slots
      .filter((slot) => activeClassDateKeys.has(slotDateKey(slot.start_at))
        && isAllowedLessonDateAndTime(slot) && !isSlotAvailable(slot))
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
          is_closed: true,
          rule_label: "해당 시간은 예약과 대기 신청이 마감되었습니다.",
        };
      });

    // 기존 DB에 평일 공통 5개 시간 중 누락된 시간이 있으면 숨기는 대신 '마감'으로 표시합니다.
    // 실제 available_slots 레코드를 생성하거나 예약 가능 상태로 변경하지 않습니다.
    // Supabase dates may be "+00:00" while generated dates use ".000Z".
    // Compare actual instants, not formatted strings, so one class time renders once.
    const startInstant = (value: string) => new Date(value).getTime();
    const seenStartTimes = new Set([
      ...available.map((slot) => startInstant(slot.start_at)),
      ...waitingSlots.map((slot) => startInstant(slot.start_at)),
      ...closedSlots.map((slot) => startInstant(slot.start_at)),
    ]);
    for (const dateKey of activeClassDateKeys) {
      const [year, month, day] = dateKey.split("-").map(Number);
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      const times = weekday === 0 || weekday === 6
        ? [...(lessonMinutes === 45 ? WEEKEND_REGULAR_START_TIMES_45 : WEEKEND_REGULAR_START_TIMES), ...WEEKEND_LIFESTYLE_START_TIMES]
        : WEEKDAY_VISIBLE_TIMETABLE_START_TIMES;
      for (const time of times) {
        const [hour, minute] = time.split(":").map(Number);
        const startAt = kstDateTimeToIso(year, month, day, hour, minute);
        if (seenStartTimes.has(startInstant(startAt))) continue;
        const duration = getReservationLessonMinutes(startAt, lessonMinutes);
        const lifestyle = isLifestyleLessonSlot(startAt);
        closedSlots.push({
          id: `closed:${startAt}`,
          start_at: startAt,
          end_at: lessonEndIso(startAt, duration),
          lesson_minutes: duration,
          credit_cost: getReservationCreditCost(startAt, lessonMinutes),
          is_lifestyle: lifestyle,
          is_closed: true,
          rule_label: "해당 시간은 예약과 대기 신청이 마감되었습니다.",
        });
        seenStartTimes.add(startInstant(startAt));
      }
    }

    // Only the fixed five weekend start times are offered:
    // 10:00 / 13:00 / 14:40 regular; 12:00 / 16:30 lifestyle.
    // A single instructor cannot be booked for two different lessons at once.
    const visibleAvailableChoices = available;
    const visibleWaitingChoices = waitingSlots;
    const visibleClosedChoices = closedSlots;

    const availableMonthCountMap = countByMonth(visibleAvailableChoices);
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

    const visibleAvailable = visibleAvailableChoices.filter((slot) => visibleMonthKeys.includes(kstMonthKeyFromIso(slot.start_at)));
    const visibleMonth = monthInfoFromKey(visibleMonthKey);
    const visibleRange = buildMonthRangeIso(visibleMonthKey);

    return NextResponse.json(
      {
        slots: visibleAvailable,
        waitlist_slots: visibleWaitingChoices.filter((slot) => visibleMonthKeys.includes(kstMonthKeyFromIso(slot.start_at))),
        closed_slots: visibleClosedChoices.filter((slot) => visibleMonthKeys.includes(kstMonthKeyFromIso(slot.start_at)))
          .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
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
          version: "v39",
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
    return NextResponse.json({ message: getErrorMessage(error), version: "v39" }, { status: 500 });
  }
}
