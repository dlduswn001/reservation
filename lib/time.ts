export function toKstDateTimeLocal(value: string) {
  if (!value) return value;
  if (value.endsWith("Z") || value.includes("+")) return value;
  return `${value}:00+09:00`;
}

export function formatKoreanDateTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
