export const MIN_HOURS_BEFORE_LESSON = 6;

export const LEGACY_POLICY_END_DATE_KEY = "2026-06-30";
export const NEW_POLICY_START_DATE_KEY = "2026-07-01";
export const LEGACY_LESSON_MINUTES = 80;
export const LEGACY_BREAK_MINUTES = 10;
export const DEFAULT_LESSON_MINUTES = 90;
export const EXTENDED_LESSON_MINUTES = 120;
export const BREAK_MINUTES = 30;
export const SLOT_INTERVAL_MINUTES = 30;

export const ONEDAY_REGULAR_BLOCK_START_DATE_KEY = "2026-07-01";
export const ONEDAY_BLOCK_WEEKDAYS = new Set(["Tue", "Wed"]);
export const ONEDAY_BLOCK_START_TIME = "19:30";
export const ONEDAY_BLOCK_END_TIME = "22:00";

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

export function reservationCutoffDate(now = new Date()) {
  return new Date(now.getTime() + MIN_HOURS_BEFORE_LESSON * 60 * 60 * 1000);
}

export function isAtLeastSixHoursBefore(startAt: string, now = new Date()) {
  return new Date(startAt).getTime() >= reservationCutoffDate(now).getTime();
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


export function overlapsOnedayRegularBlock(startAt: string, lessonMinutes: unknown = DEFAULT_LESSON_MINUTES) {
  if (dateKeyInKst(new Date(startAt)) < ONEDAY_REGULAR_BLOCK_START_DATE_KEY) return false;

  const rule = regularLessonRule(startAt, lessonMinutes);
  const { weekday, hour, minute } = kstDateTimeParts(startAt);
  if (!ONEDAY_BLOCK_WEEKDAYS.has(weekday)) return false;

  const startMinutes = hour * 60 + minute;
  const blockEndMinutes = startMinutes + rule.blockMinutes;
  const onedayStartMinutes = timeToMinutes(ONEDAY_BLOCK_START_TIME);
  const onedayEndMinutes = timeToMinutes(ONEDAY_BLOCK_END_TIME);

  return startMinutes < onedayEndMinutes && blockEndMinutes > onedayStartMinutes;
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

  return startMinutes >= operatingStart && endMinutes <= operatingEnd && !overlapsOnedayRegularBlock(startAt, lessonMinutes);
}

export function kstDateTimeToUtcIso(dateKey: string, time: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0)).toISOString();
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
