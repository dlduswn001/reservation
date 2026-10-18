export const BOOKING_MIN_HOURS_BEFORE_LESSON = 3;
export const CANCEL_MIN_HOURS_BEFORE_LESSON = 3;

// 예전 코드와의 호환을 위해 남겨둡니다. 새 예약 가능 시간 계산은 BOOKING_MIN_HOURS_BEFORE_LESSON를 사용합니다.
export const MIN_HOURS_BEFORE_LESSON = BOOKING_MIN_HOURS_BEFORE_LESSON;

export const LEGACY_POLICY_END_DATE_KEY = "2026-06-30";
export const NEW_POLICY_START_DATE_KEY = "2026-07-01";
export const LEGACY_LESSON_MINUTES = 80;
export const LEGACY_BREAK_MINUTES = 10;
export const SHORT_LESSON_MINUTES = 45;
export const DEFAULT_LESSON_MINUTES = 90;
export const EXTENDED_LESSON_MINUTES = 120;
export const BREAK_MINUTES = 30;
export const ADJUSTMENT_BREAK_MINUTES = 20;
export const ONEDAY_PREP_MINUTES = 10;
export const SLOT_INTERVAL_MINUTES = 30;

export const ADJUSTMENT_SLOT_INTERVAL_MINUTES = 10;

export function buildAdjustmentSlotStartTimesForDate(dateKey: string, isSaturday = false) {
  const startTime = isSaturday ? SATURDAY_START_TIME : WEEKDAY_START_TIME;
  const endTime = isSaturday ? SATURDAY_END_TIME : WEEKDAY_END_TIME;
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const times: string[] = [];

  for (let current = start; current <= end; current += ADJUSTMENT_SLOT_INTERVAL_MINUTES) {
    const minute = current % 60;
    // 기본 30분 단위 슬롯은 이미 available_slots에 있으므로,
    // 자동 조율 슬롯에서는 10분/20분/40분/50분 시작만 추가 후보로 봅니다.
    if (minute % SLOT_INTERVAL_MINUTES !== 0) {
      times.push(minutesToTime(current));
    }
  }

  return times.map((time) => kstDateTimeToUtcIso(dateKey, time));
}

export function autoAdjustmentSlotId(startAt: string) {
  return `auto:${encodeURIComponent(startAt)}`;
}

export function parseAutoAdjustmentSlotId(slotId: string) {
  if (!slotId.startsWith("auto:")) return null;
  const decoded = decodeURIComponent(slotId.slice(5));
  const date = new Date(decoded);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function isAutoAdjustmentCandidate(startAt: string, lessonMinutes: unknown = DEFAULT_LESSON_MINUTES) {
  if (isBeforeNewLessonPolicy(startAt)) return false;
  if (normalizeLessonDurationMinutes(lessonMinutes) !== DEFAULT_LESSON_MINUTES) return false;

  const { minute } = kstDateTimeParts(startAt);
  if (minute % ADJUSTMENT_SLOT_INTERVAL_MINUTES !== 0) return false;
  return minute % SLOT_INTERVAL_MINUTES !== 0;
}

export const WEEKDAY_START_TIME = "14:00";
export const WEEKDAY_LAST_START_TIME = "20:40";
export const WEEKDAY_END_TIME = "22:10";
export const WEEKEND_START_TIME = "10:00";
export const WEEKEND_LAST_START_TIME = "16:30";
export const WEEKEND_END_TIME = "17:15";
export const OCTOBER_TIMETABLE_START_DATE_KEY = "2026-10-01";
export const LIFESTYLE_CLASS_CREDIT_COST_FOR_90 = 0.5;
export const LIFESTYLE_CLASS_CREDIT_COST_FOR_45 = 1;
export const REGULAR_CLASS_CREDIT_COST = 1;
export const LIFESTYLE_CLASS_NAMES = ["1:1 서평생활", "1:1 필사생활"] as const;
export type LifestyleClassName = typeof LIFESTYLE_CLASS_NAMES[number];

export const WEEKDAY_REGULAR_START_TIMES = ["14:00", "17:00", "19:00", "20:40"];
// 월~금 45분 정규수업도 90분 정규수업과 동일한 네 개의 시작 시간을 사용합니다.
// 수업 길이와 수강권 차감 방식은 학생별 기존 설정을 유지합니다.
export const WEEKDAY_REGULAR_START_TIMES_45 = [...WEEKDAY_REGULAR_START_TIMES];
export const WEEKDAY_LIFESTYLE_START_TIMES = ["15:40"];
// 실제 예약창에 표시되는 월~금 공통 5개 시작 시간입니다.
export const WEEKDAY_VISIBLE_TIMETABLE_START_TIMES = Array.from(new Set([
  ...WEEKDAY_REGULAR_START_TIMES,
  ...WEEKDAY_LIFESTYLE_START_TIMES,
]));
export const WEEKEND_REGULAR_START_TIMES = ["10:00", "13:00", "14:40"];
// 주말 45분 정규수업도 정규수업 칸에서만 예약해 생활수업과 시간 충돌을 방지합니다.
export const WEEKEND_REGULAR_START_TIMES_45 = [...WEEKEND_REGULAR_START_TIMES];
// 생활수업은 정규수업 시간에 열리지 않습니다. 강사 1명이 모든 수업을 진행합니다.
export const WEEKEND_LIFESTYLE_START_TIMES = ["12:00", "16:30"];

export const WEEKDAY_ALL_TIMETABLE_START_TIMES = Array.from(new Set([
  ...WEEKDAY_REGULAR_START_TIMES,
  ...WEEKDAY_REGULAR_START_TIMES_45,
  ...WEEKDAY_LIFESTYLE_START_TIMES,
]));
export const WEEKEND_ALL_TIMETABLE_START_TIMES = Array.from(new Set([
  ...WEEKEND_REGULAR_START_TIMES,
  ...WEEKEND_REGULAR_START_TIMES_45,
  ...WEEKEND_LIFESTYLE_START_TIMES,
]));

// 예전 이름을 쓰는 코드와의 호환을 위해 남겨둡니다.
export const SATURDAY_START_TIME = WEEKEND_START_TIME;
export const SATURDAY_LAST_START_TIME = WEEKEND_LAST_START_TIME;
export const SATURDAY_END_TIME = WEEKEND_END_TIME;

export function normalizeLessonDurationMinutes(value: unknown) {
  const minutes = Number(value);
  if (minutes === SHORT_LESSON_MINUTES) return SHORT_LESSON_MINUTES;
  if (minutes === EXTENDED_LESSON_MINUTES) return EXTENDED_LESSON_MINUTES;
  return DEFAULT_LESSON_MINUTES;
}

export function lessonDurationLabel(value: unknown) {
  return `${normalizeLessonDurationMinutes(value)}분 수업`;
}

export function lifestyleLessonMinutesForStudent(_value: unknown) {
  return SHORT_LESSON_MINUTES;
}

export function normalizeLifestyleClassName(value: unknown): LifestyleClassName {
  return value === "1:1 필사생활" ? "1:1 필사생활" : "1:1 서평생활";
}

export function isOctoberTimetableDate(startAt: string) {
  return dateKeyInKst(new Date(startAt)) >= OCTOBER_TIMETABLE_START_DATE_KEY;
}

export function isLifestyleLessonSlot(startAt: string) {
  if (!isOctoberTimetableDate(startAt)) return false;
  const { weekday, hour, minute } = kstDateTimeParts(startAt);
  const time = minutesToTime(hour * 60 + minute);
  if (["Sat", "Sun"].includes(weekday)) return WEEKEND_LIFESTYLE_START_TIMES.includes(time);
  if (["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday)) return WEEKDAY_LIFESTYLE_START_TIMES.includes(time);
  return false;
}

export function isRegularLessonSlot(startAt: string) {
  if (!isOctoberTimetableDate(startAt)) return false;
  const { weekday, hour, minute } = kstDateTimeParts(startAt);
  const time = minutesToTime(hour * 60 + minute);
  if (["Sat", "Sun"].includes(weekday)) return WEEKEND_REGULAR_START_TIMES.includes(time);
  if (["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday)) return WEEKDAY_REGULAR_START_TIMES.includes(time);
  return false;
}

export function isRegularLessonSlotForStudent(startAt: string, lessonMinutes: unknown = DEFAULT_LESSON_MINUTES) {
  if (!isOctoberTimetableDate(startAt)) return false;
  const normalized = normalizeLessonDurationMinutes(lessonMinutes);
  const { weekday, hour, minute } = kstDateTimeParts(startAt);
  const time = minutesToTime(hour * 60 + minute);

  if (normalized === EXTENDED_LESSON_MINUTES) return false;

  if (["Sat", "Sun"].includes(weekday)) {
    return (normalized === SHORT_LESSON_MINUTES
      ? WEEKEND_REGULAR_START_TIMES_45
      : WEEKEND_REGULAR_START_TIMES
    ).includes(time);
  }

  if (["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday)) {
    return (normalized === SHORT_LESSON_MINUTES
      ? WEEKDAY_REGULAR_START_TIMES_45
      : WEEKDAY_REGULAR_START_TIMES
    ).includes(time);
  }

  return false;
}

export function getReservationLessonMinutes(startAt: string, studentLessonMinutes: unknown) {
  return isLifestyleLessonSlot(startAt)
    ? lifestyleLessonMinutesForStudent(studentLessonMinutes)
    : normalizeLessonDurationMinutes(studentLessonMinutes);
}

export function getReservationCreditCost(startAt: string, studentLessonMinutes: unknown = DEFAULT_LESSON_MINUTES) {
  if (!isLifestyleLessonSlot(startAt)) return REGULAR_CLASS_CREDIT_COST;
  return normalizeLessonDurationMinutes(studentLessonMinutes) === SHORT_LESSON_MINUTES
    ? LIFESTYLE_CLASS_CREDIT_COST_FOR_45
    : LIFESTYLE_CLASS_CREDIT_COST_FOR_90;
}


export function creditCostFromBookingMemo(memo: unknown, fallback = REGULAR_CLASS_CREDIT_COST) {
  const text = String(memo || "");
  const match = text.match(/수강권\s*([0-9]+(?:\.[0-9]+)?)회\s*차감/);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

export function bookingDisplayNameFromMemo(memo: unknown) {
  const text = String(memo || "");
  if (text.includes("1:1 필사생활")) return "1:1 필사생활";
  if (text.includes("1:1 서평생활")) return "1:1 서평생활";
  return "정규수업";
}

export function reservationKindLabel(startAt: string, lifestyleClassName?: unknown) {
  if (isLifestyleLessonSlot(startAt)) return normalizeLifestyleClassName(lifestyleClassName);
  return "정규수업";
}

export function isBeforeNewLessonPolicy(startAt: string) {
  return dateKeyInKst(new Date(startAt)) < NEW_POLICY_START_DATE_KEY;
}

export function regularLessonRule(startAt: string, lessonMinutes: unknown = DEFAULT_LESSON_MINUTES) {
  if (isBeforeNewLessonPolicy(startAt)) {
    return {
      lessonMinutes: LEGACY_LESSON_MINUTES,
      breakMinutes: LEGACY_BREAK_MINUTES,
      blockMinutes: LEGACY_LESSON_MINUTES + LEGACY_BREAK_MINUTES,
      label: "80분 수업 + 10분 휴식",
      policyLabel: "2026년 6월 30일까지 기존 규칙",
    };
  }

  const normalizedLessonMinutes = normalizeLessonDurationMinutes(lessonMinutes);
  const isLifestyleMinutes = normalizedLessonMinutes === SHORT_LESSON_MINUTES;
  return {
    lessonMinutes: normalizedLessonMinutes,
    breakMinutes: isLifestyleMinutes ? 0 : BREAK_MINUTES,
    blockMinutes: normalizedLessonMinutes + (isLifestyleMinutes ? 0 : BREAK_MINUTES),
    label: isLifestyleMinutes ? `${normalizedLessonMinutes}분 수업` : `${normalizedLessonMinutes}분 수업 + 30분 휴식`,
    policyLabel: isLifestyleMinutes ? "2026년 10월부터 생활수업 규칙" : "2026년 7월 1일부터 새 규칙",
  };
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function minutesToTime(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildThirtyMinuteTimes(startTime: string, lastStartTime: string) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(lastStartTime);
  const times: string[] = [];

  for (let current = start; current <= end; current += SLOT_INTERVAL_MINUTES) {
    times.push(minutesToTime(current));
  }

  return times;
}

export const WEEKDAY_TIMES = buildThirtyMinuteTimes(WEEKDAY_START_TIME, WEEKDAY_LAST_START_TIME);
export const WEEKEND_TIMES = buildThirtyMinuteTimes(WEEKEND_START_TIME, WEEKEND_LAST_START_TIME);
export const SATURDAY_TIMES = WEEKEND_TIMES;

export function bookingCutoffDate(now = new Date()) {
  return new Date(now.getTime() + BOOKING_MIN_HOURS_BEFORE_LESSON * 60 * 60 * 1000);
}

export function cancelCutoffDate(now = new Date()) {
  return new Date(now.getTime() + CANCEL_MIN_HOURS_BEFORE_LESSON * 60 * 60 * 1000);
}

// 예약 가능 시간을 계산할 때 사용합니다. 현재 정책은 수업 시작 3시간 전까지 예약 가능입니다.
export function reservationCutoffDate(now = new Date()) {
  return bookingCutoffDate(now);
}

export function isAtLeastThreeHoursBefore(startAt: string, now = new Date()) {
  return new Date(startAt).getTime() >= bookingCutoffDate(now).getTime();
}

export function isAtLeastCancelHoursBefore(startAt: string, now = new Date()) {
  return new Date(startAt).getTime() >= cancelCutoffDate(now).getTime();
}

// 이전 함수명을 쓰던 코드가 있어도 현재 취소 기준(3시간 전)을 따르도록 호환용으로 남겨둡니다.
export function isAtLeastSixHoursBefore(startAt: string, now = new Date()) {
  return isAtLeastCancelHoursBefore(startAt, now);
}

export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
) {
  return new Date(aStart).getTime() < new Date(bEnd).getTime()
    && new Date(aEnd).getTime() > new Date(bStart).getTime();
}

export function addMinutesToIso(iso: string, minutes: number) {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}


export function minutesBetweenIso(earlierIso: string, laterIso: string) {
  return Math.floor((new Date(laterIso).getTime() - new Date(earlierIso).getTime()) / (60 * 1000));
}

export function isAdjustmentSlotTime(startAt: string) {
  if (isBeforeNewLessonPolicy(startAt)) return false;
  const { minute } = kstDateTimeParts(startAt);
  return minute % SLOT_INTERVAL_MINUTES !== 0;
}

export function requiredBreakBetweenRegularLessons(earlierStartAt: string, laterStartAt: string) {
  if (isBeforeNewLessonPolicy(earlierStartAt) || isBeforeNewLessonPolicy(laterStartAt)) {
    return LEGACY_BREAK_MINUTES;
  }

  // 2026년 10월부터는 확정 시간표 자체에 10분~30분 휴식이 반영되어 있습니다.
  // 예: 수-금 20:30 종료 후 20:40 시작, 토-일 14:30 종료 후 14:40 시작.
  if (isOctoberTimetableDate(earlierStartAt) && isOctoberTimetableDate(laterStartAt)) {
    return 10;
  }

  // 관리자가 17:50처럼 직접 여는 조율 슬롯은 하루 수업 수를 확보하기 위해
  // 정규수업 사이 최소 20분 휴식을 허용합니다. 일반 30분 단위 슬롯은 30분 휴식을 유지합니다.
  if (isAdjustmentSlotTime(earlierStartAt) || isAdjustmentSlotTime(laterStartAt)) {
    return ADJUSTMENT_BREAK_MINUTES;
  }

  return BREAK_MINUTES;
}

function lessonDurationFromRange(startAt: string, endAt: string) {
  return Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000);
}

function requiredBreakForRanges(earlierStartAt: string, earlierEndAt: string, laterStartAt: string, laterEndAt: string) {
  const earlierMinutes = lessonDurationFromRange(earlierStartAt, earlierEndAt);
  const laterMinutes = lessonDurationFromRange(laterStartAt, laterEndAt);

  // 45분 정규수업은 90분 정규수업 한 칸을 둘로 나누어 운영할 수 있으므로
  // 45분 수업끼리는 바로 이어서 예약할 수 있습니다.
  if (isOctoberTimetableDate(earlierStartAt) && isOctoberTimetableDate(laterStartAt)
    && earlierMinutes === SHORT_LESSON_MINUTES && laterMinutes === SHORT_LESSON_MINUTES) {
    return 0;
  }

  return requiredBreakBetweenRegularLessons(earlierStartAt, laterStartAt);
}

export function regularBookingConflict(
  candidateStartAt: string,
  candidateEndAt: string,
  existingStartAt: string,
  existingEndAt: string
) {
  // 실제 수업 시간이 겹치면 예약할 수 없습니다.
  if (overlaps(candidateStartAt, candidateEndAt, existingStartAt, existingEndAt)) return true;

  // 후보 수업이 기존 수업보다 먼저 끝나는 경우: 후보 수업 후 휴식 시간이 필요합니다.
  if (new Date(candidateEndAt).getTime() <= new Date(existingStartAt).getTime()) {
    const requiredBreak = requiredBreakForRanges(candidateStartAt, candidateEndAt, existingStartAt, existingEndAt);
    return minutesBetweenIso(candidateEndAt, existingStartAt) < requiredBreak;
  }

  // 기존 수업이 후보 수업보다 먼저 끝나는 경우: 기존 수업 후 휴식 시간이 필요합니다.
  if (new Date(existingEndAt).getTime() <= new Date(candidateStartAt).getTime()) {
    const requiredBreak = requiredBreakForRanges(existingStartAt, existingEndAt, candidateStartAt, candidateEndAt);
    return minutesBetweenIso(existingEndAt, candidateStartAt) < requiredBreak;
  }

  return false;
}

export function conflictsWithRegularBookings(
  candidateStartAt: string,
  candidateEndAt: string,
  bookings: TimeBlock[] = []
) {
  return bookings.some((booking) => regularBookingConflict(
    candidateStartAt,
    candidateEndAt,
    booking.start_at,
    booking.end_at
  ));
}

export function conflictsWithOneDayBlocks(
  candidateStartAt: string,
  candidateEndAt: string,
  blocks: TimeBlock[] = [],
  prepMinutes = ONEDAY_PREP_MINUTES
) {
  return blocks.some((block) => {
    if (overlaps(candidateStartAt, candidateEndAt, block.start_at, block.end_at)) return true;

    // 정규수업이 원데이 클래스보다 먼저 끝나는 경우, 원데이 시작 전 최소 준비 시간을 확보합니다.
    if (new Date(candidateEndAt).getTime() <= new Date(block.start_at).getTime()) {
      return minutesBetweenIso(candidateEndAt, block.start_at) < prepMinutes;
    }

    return false;
  });
}

export function lessonEndIso(startAt: string, lessonMinutes: unknown = DEFAULT_LESSON_MINUTES) {
  return addMinutesToIso(startAt, regularLessonRule(startAt, lessonMinutes).lessonMinutes);
}

export function bookingBlockEndIso(startAt: string, lessonMinutes: unknown = DEFAULT_LESSON_MINUTES) {
  return addMinutesToIso(startAt, regularLessonRule(startAt, lessonMinutes).blockMinutes);
}

export function bookingBlockEndIsoFromEnd(endAt: string) {
  const breakMinutes = isBeforeNewLessonPolicy(endAt) ? LEGACY_BREAK_MINUTES : BREAK_MINUTES;
  return addMinutesToIso(endAt, breakMinutes);
}

function kstDateTimeParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date(iso));

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return {
    weekday: get("weekday"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}


export type TimeBlock = { start_at: string; end_at: string };

export function overlapsAnyTimeBlock(startAt: string, endAt: string, blocks: TimeBlock[] = []) {
  return blocks.some((block) => overlaps(startAt, endAt, block.start_at, block.end_at));
}



// 월·화요일은 자동 시간표 대신 관리자가 직접 연 DB 슬롯만 예약 가능합니다.
// 기존 수·목·금 및 토·일 시간표의 허용 조건에는 영향을 주지 않습니다.
export function isAdminOpenedMondayTuesdaySlot(
  startAt: string,
  endAt: string | null | undefined,
  lessonMinutes: unknown = DEFAULT_LESSON_MINUTES
) {
  if (!isOctoberTimetableDate(startAt) || !endAt) return false;
  const { weekday } = kstDateTimeParts(startAt);
  if (weekday !== "Mon" && weekday !== "Tue") return false;

  const minutes = normalizeLessonDurationMinutes(lessonMinutes);
  if (minutes === EXTENDED_LESSON_MINUTES) return false;

  const startMs = new Date(startAt).getTime();
  const endMs = new Date(endAt).getTime();
  return Number.isFinite(startMs)
    && Number.isFinite(endMs)
    && endMs - startMs >= minutes * 60 * 1000;
}

export function isLessonWithinOperatingHours(startAt: string, lessonMinutes: unknown = DEFAULT_LESSON_MINUTES) {
  const rule = regularLessonRule(startAt, lessonMinutes);
  const { weekday, hour, minute } = kstDateTimeParts(startAt);

  if (isOctoberTimetableDate(startAt)) {
    return isRegularLessonSlotForStudent(startAt, lessonMinutes) || isLifestyleLessonSlot(startAt);
  }

  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const startMinutes = hour * 60 + minute;
  const endMinutes = startMinutes + rule.lessonMinutes;
  const operatingEnd = isWeekend ? timeToMinutes(WEEKEND_END_TIME) : timeToMinutes(WEEKDAY_END_TIME);
  const operatingStart = isWeekend ? timeToMinutes(WEEKEND_START_TIME) : timeToMinutes(WEEKDAY_START_TIME);

  return startMinutes >= operatingStart && endMinutes <= operatingEnd;
}

export function kstDateTimeToUtcIso(dateKey: string, time: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0)).toISOString();
}


export function isSaturdayDateKey(dateKey: string) {
  const noonIso = kstDateTimeToUtcIso(dateKey, "12:00");
  return kstDateTimeParts(noonIso).weekday === "Sat";
}

export function dateKeyInKst(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function buildTimetableSlots(startDateKey: string, weeks: number) {
  const [year, month, day] = startDateKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const totalDays = Math.max(1, Math.min(26, weeks)) * 7;
  const rows: Array<{ start_at: string; end_at: string; is_open: boolean }> = [];

  for (let i = 0; i < totalDays; i += 1) {
    const current = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const weekday = current.getUTCDay();
    const dateKey = dateKeyInKst(current);

    let timeRows: Array<{ time: string; minutes: number }> = [];

    if (dateKey >= OCTOBER_TIMETABLE_START_DATE_KEY) {
      if ([3, 4, 5].includes(weekday)) {
        timeRows = [
          ...WEEKDAY_VISIBLE_TIMETABLE_START_TIMES.map((time) => ({
            time,
            minutes: WEEKDAY_REGULAR_START_TIMES.includes(time) ? DEFAULT_LESSON_MINUTES : SHORT_LESSON_MINUTES,
          })),
        ];
      } else if (weekday === 0 || weekday === 6) {
        timeRows = [
          ...WEEKEND_ALL_TIMETABLE_START_TIMES.map((time) => ({
            time,
            minutes: WEEKEND_LIFESTYLE_START_TIMES.includes(time) ? SHORT_LESSON_MINUTES : DEFAULT_LESSON_MINUTES,
          })),
        ];
      } else {
        timeRows = [];
      }
    } else {
      const times = weekday === 0 || weekday === 6 ? WEEKEND_TIMES : WEEKDAY_TIMES;
      timeRows = times.map((time) => ({ time, minutes: DEFAULT_LESSON_MINUTES }));
    }

    for (const row of timeRows) {
      const startAt = kstDateTimeToUtcIso(dateKey, row.time);
      rows.push({
        start_at: startAt,
        end_at: addMinutesToIso(startAt, row.minutes),
        is_open: true,
      });
    }
  }

  return rows;
}
