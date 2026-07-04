export const BOOKING_MIN_HOURS_BEFORE_LESSON = 3;
export const CANCEL_MIN_HOURS_BEFORE_LESSON = 6;

// 예전 코드와의 호환을 위해 남겨둡니다. 새 예약 가능 시간 계산은 BOOKING_MIN_HOURS_BEFORE_LESSON를 사용합니다.
export const MIN_HOURS_BEFORE_LESSON = BOOKING_MIN_HOURS_BEFORE_LESSON;

export const LEGACY_POLICY_END_DATE_KEY = "2026-06-30";
export const NEW_POLICY_START_DATE_KEY = "2026-07-01";
export const LEGACY_LESSON_MINUTES = 80;
export const LEGACY_BREAK_MINUTES = 10;
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
export const WEEKDAY_LAST_START_TIME = "20:30";
export const WEEKDAY_END_TIME = "22:00";
export const SATURDAY_START_TIME = "10:00";
export const SATURDAY_LAST_START_TIME = "16:30";
export const SATURDAY_END_TIME = "18:00";

export function normalizeLessonDurationMinutes(value: unknown) {
  const minutes = Number(value);
  return minutes === EXTENDED_LESSON_MINUTES ? EXTENDED_LESSON_MINUTES : DEFAULT_LESSON_MINUTES;
}

export function lessonDurationLabel(value: unknown) {
  return `${normalizeLessonDurationMinutes(value)}분 수업`;
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
  return {
    lessonMinutes: normalizedLessonMinutes,
    breakMinutes: BREAK_MINUTES,
    blockMinutes: normalizedLessonMinutes + BREAK_MINUTES,
    label: `${normalizedLessonMinutes}분 수업 + 30분 휴식`,
    policyLabel: "2026년 7월 1일부터 새 규칙",
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
export const SATURDAY_TIMES = buildThirtyMinuteTimes(SATURDAY_START_TIME, SATURDAY_LAST_START_TIME);

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

export function isAtLeastSixHoursBefore(startAt: string, now = new Date()) {
  return new Date(startAt).getTime() >= cancelCutoffDate(now).getTime();
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

  // 관리자가 17:50처럼 직접 여는 조율 슬롯은 하루 수업 수를 확보하기 위해
  // 정규수업 사이 최소 20분 휴식을 허용합니다. 일반 30분 단위 슬롯은 30분 휴식을 유지합니다.
  if (isAdjustmentSlotTime(earlierStartAt) || isAdjustmentSlotTime(laterStartAt)) {
    return ADJUSTMENT_BREAK_MINUTES;
  }

  return BREAK_MINUTES;
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
    const requiredBreak = requiredBreakBetweenRegularLessons(candidateStartAt, existingStartAt);
    return minutesBetweenIso(candidateEndAt, existingStartAt) < requiredBreak;
  }

  // 기존 수업이 후보 수업보다 먼저 끝나는 경우: 기존 수업 후 휴식 시간이 필요합니다.
  if (new Date(existingEndAt).getTime() <= new Date(candidateStartAt).getTime()) {
    const requiredBreak = requiredBreakBetweenRegularLessons(existingStartAt, candidateStartAt);
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



export function isLessonWithinOperatingHours(startAt: string, lessonMinutes: unknown = DEFAULT_LESSON_MINUTES) {
  const rule = regularLessonRule(startAt, lessonMinutes);
  const { weekday, hour, minute } = kstDateTimeParts(startAt);

  // 일요일은 정규수업을 열지 않습니다.
  if (weekday === "Sun") return false;

  const startMinutes = hour * 60 + minute;
  const endMinutes = startMinutes + rule.lessonMinutes;
  const operatingEnd = weekday === "Sat" ? timeToMinutes(SATURDAY_END_TIME) : timeToMinutes(WEEKDAY_END_TIME);
  const operatingStart = weekday === "Sat" ? timeToMinutes(SATURDAY_START_TIME) : timeToMinutes(WEEKDAY_START_TIME);

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
    if (weekday === 0) continue;

    const dateKey = dateKeyInKst(current);
    const times = weekday === 6 ? SATURDAY_TIMES : WEEKDAY_TIMES;

    for (const time of times) {
      const startAt = kstDateTimeToUtcIso(dateKey, time);
      rows.push({
        start_at: startAt,
        end_at: lessonEndIso(startAt, DEFAULT_LESSON_MINUTES),
        is_open: true,
      });
    }
  }

  return rows;
}
