export const MIN_HOURS_BEFORE_LESSON = 6;
export const LESSON_MINUTES = 80;
export const BREAK_MINUTES = 10;
export const BOOKING_BLOCK_MINUTES = LESSON_MINUTES + BREAK_MINUTES;
export const SLOT_INTERVAL_MINUTES = 30;

export const WEEKDAY_START_TIME = "14:00";
export const WEEKDAY_LAST_START_TIME = "20:30";
export const SATURDAY_START_TIME = "10:00";
export const SATURDAY_LAST_START_TIME = "16:30";

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
  return new Date(startAt).getTime() > reservationCutoffDate(now).getTime();
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

export function bookingBlockEndIso(startAt: string) {
  return addMinutesToIso(startAt, BOOKING_BLOCK_MINUTES);
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
        end_at: addMinutesToIso(startAt, LESSON_MINUTES),
        is_open: true,
      });
    }
  }

  return rows;
}
