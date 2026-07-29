import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import {
  isAtLeastThreeHoursBefore,
  isLessonWithinOperatingHours,
  lessonEndIso,
  normalizeLessonDurationMinutes,
  conflictsWithOneDayBlocks,
  conflictsWithRegularBookings,
  regularLessonRule,
  overlapsAnyTimeBlock,
} from "../../../lib/businessRules";
import { getErrorMessage, isMissingPassColumnError } from "../../../lib/supabaseCompat";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const APP_VERSION = "23";
const ACTIVE_BOOKING_STATUSES = ["booked", "change_request", "cancel_request"];
const AUTO_AFTER_BUSY_BUFFER_MINUTES = 20;
const AUTO_BEFORE_NEXT_BUFFER_MINUTES = 10;

type RawSlot = {
  id: string;
  start_at: string;
  end_at: string | null;
  is_open?: boolean;
};

type TimeBlock = {
  id?: string;
  start_at: string;
  end_at: string;
  status?: string;
};

type StudentForSlots = {
  id: string;
  lesson_duration_minutes?: number | null;
};

function normalizeMonthKey(value: string | null) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}$/.test(text)) return "";
  return text;
}

function kstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

function preferredMonthKey() {
  const nowPlusThreeHours = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const { year, month, day } = kstParts(nowPlusThreeHours);
  const target = day >= 25 ? new Date(Date.UTC(year, month, 1)) : new Date(Date.UTC(year, month - 1, 1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRangeUtcIso(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, -9, 0, 0, 0));
  return { start_at: start.toISOString(), end_at: end.toISOString() };
}

function monthInfo(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const range = monthRangeUtcIso(monthKey);
  return {
    key: monthKey,
    year,
    month,
    range_start_at: range.start_at,
    range_end_at: range.end_at,
    mode: "v23-force-month",
  };
}

function monthKeyFromIso(value: string) {
  const { year, month } = kstParts(new Date(value));
  return `${year}-${String(month).padStart(2, "0")}`;
}

function dateKeyFromIso(value: string) {
  const { year, month, day } = kstParts(new Date(value));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addMinutesIso(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

function makeAutoSlotId(startAt: string) {
  return `auto:${encodeURIComponent(startAt)}`;
}

function countByMonth(items: Array<{ start_at: string }>) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = monthKeyFromIso(item.start_at);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function normalizeSlot(slot: RawSlot, lessonMinutes: number) {
  const rule = regularLessonRule(slot.start_at, lessonMinutes);
  const endAt = lessonEndIso(slot.start_at, lessonMinutes);
  return {
    id: slot.id,
    start_at: slot.start_at,
    end_at: endAt,
    lesson_minutes: lessonMinutes,
    break_minutes: 10,
    rule_label: rule.label,
    is_auto_adjustment: false,
  };
}

function slotIsAvailable(
  startAt: string,
  endAt: string,
  lessonMinutes: number,
  regularBookings: TimeBlock[],
  onedayClasses: TimeBlock[],
  blockedTimes: TimeBlock[],
) {
  if (!isAtLeastThreeHoursBefore(startAt)) return false;
  if (!isLessonWithinOperatingHours(startAt, lessonMinutes)) return false;
  if (conflictsWithRegularBookings(startAt, endAt, regularBookings)) return false;
  if (conflictsWithOneDayBlocks(startAt, endAt, onedayClasses)) return false;
  if (overlapsAnyTimeBlock(startAt, endAt, blockedTimes)) return false;
  return true;
}

function generateAutoAdjustmentSlots(
  targetMonthKey: string,
  lessonMinutes: number,
  rawSlots: RawSlot[],
  regularBookings: TimeBlock[],
  onedayClasses: TimeBlock[],
  blockedTimes: TimeBlock[],
) {
  const busyBlocks = [...regularBookings, ...onedayClasses, ...blockedTimes]
    .filter((block) => block.start_at && block.end_at && monthKeyFromIso(block.start_at) === targetMonthKey)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  const dates = uniqueSorted([
    ...rawSlots.filter((slot) => monthKeyFromIso(slot.start_at) === targetMonthKey).map((slot) => dateKeyFromIso(slot.start_at)),
    ...busyBlocks.map((block) => dateKeyFromIso(block.start_at)),
  ]);

  const existingStartTimes = new Set(rawSlots.map((slot) => new Date(slot.start_at).getTime()));
  const generated: ReturnType<typeof normalizeSlot>[] = [];
  const generatedStartTimes = new Set<number>();

  for (const dateKey of dates) {
    const dayBusy = busyBlocks
      .filter((block) => dateKeyFromIso(block.start_at) === dateKey)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    for (let index = 0; index < dayBusy.length; index += 1) {
      const current = dayBusy[index];
      const next = dayBusy[index + 1];
      if (!next) continue;

      const candidateStart = addMinutesIso(current.end_at, AUTO_AFTER_BUSY_BUFFER_MINUTES);
      const candidateEnd = lessonEndIso(candidateStart, lessonMinutes);
      const latestAllowedEnd = addMinutesIso(next.start_at, -AUTO_BEFORE_NEXT_BUFFER_MINUTES);
      const candidateStartMs = new Date(candidateStart).getTime();

      if (new Date(candidateEnd).getTime() > new Date(latestAllowedEnd).getTime()) continue;
      if (existingStartTimes.has(candidateStartMs) || generatedStartTimes.has(candidateStartMs)) continue;
      if (!slotIsAvailable(candidateStart, candidateEnd, lessonMinutes, regularBookings, onedayClasses, blockedTimes)) continue;

      generatedStartTimes.add(candidateStartMs);
      const rule = regularLessonRule(candidateStart, lessonMinutes);
      generated.push({
        id: makeAutoSlotId(candidateStart),
        start_at: candidateStart,
        end_at: candidateEnd,
        lesson_minutes: lessonMinutes,
        break_minutes: 10,
        rule_label: rule.label,
        is_auto_adjustment: true,
      });
    }
  }

  return generated;
}

async function readStudentLessonMinutes(studentId: string, fallbackLessonMinutes: number) {
  if (!studentId) return fallbackLessonMinutes;

  const supabase = getSupabaseAdmin();
  let studentResult = await supabase
    .from("students")
    .select("id, lesson_duration_minutes, pass_registered_at, pass_first_lesson_at, pass_expires_at, pass_extension_until")
    .eq("id", studentId)
    .eq("is_active", true)
    .single();

  if (studentResult.error && isMissingPassColumnError(studentResult.error)) {
    studentResult = await supabase
      .from("students")
      .select("id, lesson_duration_minutes")
      .eq("id", studentId)
      .eq("is_active", true)
      .single();
  }

  if (studentResult.error || !studentResult.data) return fallbackLessonMinutes;
  const student = studentResult.data as StudentForSlots;
  return normalizeLessonDurationMinutes(student.lesson_duration_minutes || fallbackLessonMinutes);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const studentId = String(url.searchParams.get("studentId") || "");
    const requestedMonthKey = normalizeMonthKey(url.searchParams.get("month"));
    const queryLessonMinutes = Number(url.searchParams.get("lessonMinutes") || 0);
    const lessonMinutes = await readStudentLessonMinutes(
      studentId,
      normalizeLessonDurationMinutes(queryLessonMinutes || 90),
    );

    const supabase = getSupabaseAdmin();
    const fromIso = new Date(Date.now() - 60 * 60_000).toISOString();
    const toIso = new Date(Date.now() + 140 * 24 * 60 * 60_000).toISOString();

    const { data: rawSlotsData, error: rawSlotsError } = await supabase
      .from("available_slots")
      .select("id, start_at, end_at, is_open")
      .eq("is_open", true)
      .gte("start_at", fromIso)
      .lt("start_at", toIso)
      .order("start_at", { ascending: true })
      .limit(5000);

    if (rawSlotsError) throw rawSlotsError;

    const rawSlots = ((rawSlotsData || []) as RawSlot[])
      .filter((slot) => slot.start_at && isAtLeastThreeHoursBefore(slot.start_at));

    const { data: regularBookingsData, error: regularBookingsError } = await supabase
      .from("regular_bookings")
      .select("id, slot_id, start_at, end_at, status")
      .in("status", ACTIVE_BOOKING_STATUSES)
      .gte("end_at", fromIso)
      .lt("start_at", toIso)
      .order("start_at", { ascending: true })
      .limit(5000);

    if (regularBookingsError) throw regularBookingsError;

    const { data: onedayClassesData, error: onedayError } = await supabase
      .from("oneday_classes")
      .select("id, start_at, end_at")
      .eq("is_open", true)
      .gte("end_at", fromIso)
      .lt("start_at", toIso)
      .order("start_at", { ascending: true })
      .limit(2000);

    if (onedayError) throw onedayError;

    const { data: blockedTimesData, error: blockedError } = await supabase
      .from("blocked_times")
      .select("id, start_at, end_at")
      .gte("end_at", fromIso)
      .lt("start_at", toIso)
      .order("start_at", { ascending: true })
      .limit(2000);

    if (blockedError) throw blockedError;

    const regularBookings = (regularBookingsData || []) as TimeBlock[];
    const onedayClasses = (onedayClassesData || []) as TimeBlock[];
    const blockedTimes = (blockedTimesData || []) as TimeBlock[];

    const rawMonthCounts = countByMonth(rawSlots);
    const rawMonthKeys = uniqueSorted(Object.keys(rawMonthCounts));
    const preferred = preferredMonthKey();
    const fallbackMonthKey = requestedMonthKey || (rawMonthKeys.includes(preferred) ? preferred : rawMonthKeys[0] || preferred);
    const targetMonthKey = requestedMonthKey || fallbackMonthKey;

    const filteredNormalSlots = rawSlots
      .map((slot) => normalizeSlot(slot, lessonMinutes))
      .filter((slot) => slotIsAvailable(slot.start_at, slot.end_at, lessonMinutes, regularBookings, onedayClasses, blockedTimes));

    const autoSlots = generateAutoAdjustmentSlots(
      targetMonthKey,
      lessonMinutes,
      rawSlots,
      regularBookings,
      onedayClasses,
      blockedTimes,
    );

    const allAvailableSlots = [...filteredNormalSlots, ...autoSlots]
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    const availableMonthCounts = countByMonth(allAvailableSlots);
    const availableMonthKeys = uniqueSorted(Object.keys(availableMonthCounts));
    const monthOptionKeys = uniqueSorted([...rawMonthKeys, ...availableMonthKeys, targetMonthKey]);

    const availableMonths = monthOptionKeys.map((key) => {
      const [year, month] = key.split("-").map(Number);
      const rawCount = rawMonthCounts[key] || 0;
      const availableCount = availableMonthCounts[key] || 0;
      return {
        key,
        year,
        month,
        count: availableCount || rawCount,
        raw_count: rawCount,
        available_count: availableCount,
      };
    });

    const selectedSlots = allAvailableSlots
      .filter((slot) => monthKeyFromIso(slot.start_at) === targetMonthKey)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    return NextResponse.json(
      {
        ok: true,
        version: APP_VERSION,
        slots: selectedSlots,
        open_month: monthInfo(targetMonthKey),
        available_months: availableMonths,
        debug: {
          version: APP_VERSION,
          selected_month_key: targetMonthKey,
          requested_month_key: requestedMonthKey || null,
          preferred_month_key: preferred,
          raw_month_keys: rawMonthKeys,
          available_month_keys: availableMonthKeys,
          month_option_keys: monthOptionKeys,
          raw_slot_count: rawSlots.length,
          available_slot_count: allAvailableSlots.length,
          selected_slot_count: selectedSlots.length,
          auto_adjustment_count: autoSlots.length,
          lesson_minutes: lessonMinutes,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
          "Surrogate-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error), version: APP_VERSION },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
