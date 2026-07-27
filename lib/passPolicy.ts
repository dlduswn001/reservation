export const PASS_POLICY_START_DATE_KEY = "2026-08-01";
export const PASS_VALID_DAYS = 56; // 8주
export const PASS_EXTENSION_DAYS = 14; // 최대 2주

export type RegularPassPolicyStudent = {
  pass_registered_at?: string | null;
  pass_first_lesson_at?: string | null;
  pass_expires_at?: string | null;
  pass_extension_until?: string | null;
  pass_extension_used?: boolean | null;
  pass_extension_reason?: string | null;
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function cleanDateKey(value: unknown) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return raw;
}

export function dateKeyInKst(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayDateKeyInKst() {
  return dateKeyInKst(new Date());
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 0, 0, 0, 0));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function daysBetweenDateKeys(fromDateKey: string, toDateKey: string) {
  const [fy, fm, fd] = fromDateKey.split("-").map(Number);
  const [ty, tm, td] = toDateKey.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd, 0, 0, 0, 0);
  const to = Date.UTC(ty, tm - 1, td, 0, 0, 0, 0);
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

export function calculatePassExpirationDateKey(firstLessonDateKey: string) {
  return addDaysToDateKey(firstLessonDateKey, PASS_VALID_DAYS);
}

export function maxExtensionDateKey(expiresAtDateKey: string) {
  return addDaysToDateKey(expiresAtDateKey, PASS_EXTENSION_DAYS);
}

export function shouldApplyRegularPassPolicy(student: RegularPassPolicyStudent) {
  const registeredAt = cleanDateKey(student.pass_registered_at);
  return Boolean(registeredAt && registeredAt >= PASS_POLICY_START_DATE_KEY);
}

export function effectivePassExpirationDateKey(student: RegularPassPolicyStudent) {
  if (!shouldApplyRegularPassPolicy(student)) return null;
  const extendedUntil = cleanDateKey(student.pass_extension_until);
  if (extendedUntil) return extendedUntil;

  const savedExpiresAt = cleanDateKey(student.pass_expires_at);
  if (savedExpiresAt) return savedExpiresAt;

  const firstLessonAt = cleanDateKey(student.pass_first_lesson_at);
  if (!firstLessonAt) return null;
  return calculatePassExpirationDateKey(firstLessonAt);
}

export function getRegularPassPolicyStatus(student: RegularPassPolicyStudent, referenceDateKey = todayDateKeyInKst()) {
  const applies = shouldApplyRegularPassPolicy(student);
  const registeredAt = cleanDateKey(student.pass_registered_at);
  const firstLessonAt = cleanDateKey(student.pass_first_lesson_at);
  const expiresAt = effectivePassExpirationDateKey(student);
  const baseExpiresAt = cleanDateKey(student.pass_expires_at)
    || (firstLessonAt ? calculatePassExpirationDateKey(firstLessonAt) : null);
  const extensionUntil = cleanDateKey(student.pass_extension_until);
  const daysLeft = expiresAt ? daysBetweenDateKeys(referenceDateKey, expiresAt) : null;
  const expired = applies && typeof daysLeft === "number" && daysLeft < 0;
  const expiringSoon = applies && typeof daysLeft === "number" && daysLeft >= 0 && daysLeft <= 7;

  let label = "정책 적용 전";
  if (applies && !firstLessonAt) label = "첫 수업일 대기";
  if (applies && firstLessonAt && expiresAt) label = expired ? "사용기한 만료" : expiringSoon ? "사용기한 임박" : "정상 사용 중";
  if (applies && extensionUntil && !expired) label = "연장 사용 중";

  return {
    applies,
    registeredAt,
    firstLessonAt,
    baseExpiresAt,
    expiresAt,
    extensionUntil,
    daysLeft,
    expired,
    expiringSoon,
    label,
  };
}

export function canBookWithRegularPassPolicy(student: RegularPassPolicyStudent, lessonStartAtIso: string) {
  const lessonDateKey = dateKeyInKst(new Date(lessonStartAtIso));
  const status = getRegularPassPolicyStatus(student, lessonDateKey);
  if (!status.applies) return { ok: true, status };
  if (!status.firstLessonAt) return { ok: true, status };
  if (!status.expiresAt) return { ok: true, status };
  return {
    ok: lessonDateKey <= status.expiresAt,
    status,
  };
}
