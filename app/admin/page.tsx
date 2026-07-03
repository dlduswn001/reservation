"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Student = {
  id: string;
  name: string;
  phone_last4: string;
  is_active: boolean;
  memo?: string;
  lesson_credits?: number;
  lesson_duration_minutes?: number;
};

type Booking = {
  id: string;
  student_id?: string | null;
  slot_id?: string | null;
  start_at: string;
  end_at: string;
  status: string;
  memo?: string;
  students?: { name?: string; phone_last4?: string } | null;
};


type LessonHistory = {
  id: string;
  student_id: string;
  lesson_date: string;
  title: string;
  memo?: string | null;
  created_at?: string;
  students?: { name?: string; phone_last4?: string } | null;
};

type BlockedTime = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  memo?: string | null;
  created_at?: string;
};

type OneDayClass = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  capacity: number;
  regular_price?: number | null;
  normal_price?: number | null;
  description?: string | null;
  is_open: boolean;
};

type OneDayBooking = {
  id: string;
  class_id?: string | null;
  student_name: string;
  phone_last4?: string;
  people_count?: number;
  is_regular_student?: boolean;
  status?: string;
  amount_due?: number | null;
  created_at?: string;
  oneday_classes?: { id?: string; title?: string; start_at?: string; end_at?: string } | null;
};

type Overview = {
  students: Student[];
  slots: any[];
  bookings: Booking[];
  classes: OneDayClass[];
  onedayBookings: OneDayBooking[];
  lessonHistory: LessonHistory[];
  blockedTimes: BlockedTime[];
};

type TodayScheduleItem = {
  id: string;
  type: "regular" | "block" | "oneday";
  start_at: string;
  end_at: string;
  label: string;
  title: string;
  subtitle: string;
  detail?: string;
};

type AdminTab = "dashboard" | "schedule" | "students" | "history" | "timetable" | "slots" | "blocks" | "bookings" | "oneday" | "settings";

const STATUS_LABELS: Record<string, string> = {
  booked: "예약 완료",
  cancelled: "취소 완료",
  late_cancelled: "6시간 이내 취소",
  done: "수업 완료",
  change_request: "변경 요청",
  cancel_request: "취소 요청",
};

const TAB_LABELS: Array<{ id: AdminTab; label: string }> = [
  { id: "dashboard", label: "홈" },
  { id: "schedule", label: "스케줄" },
  { id: "students", label: "수강생" },
  { id: "oneday", label: "원데이" },
  { id: "settings", label: "설정" },
];

const SCHEDULE_TABS: AdminTab[] = ["schedule", "timetable", "slots", "blocks", "bookings"];
const STUDENT_TABS: AdminTab[] = ["students", "history"];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}


function addMinutesToLocalDateTime(value: string, minutes: number) {
  if (!value) return "";
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return "";
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute || 0, 0, 0);
  date.setMinutes(date.getMinutes() + minutes);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function formatMonthLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
  }).format(new Date(value));
}

function seoulMonthKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(value));
}

const ONEDAY_STATUS_LABELS: Record<string, string> = {
  booked: "입금 대기",
  cancelled: "취소 완료",
  "입금대기": "입금 대기",
  "등록대기": "무료 등록 대기",
  "입금완료": "등록 완료",
  "등록완료": "등록 완료",
};

const ACTIVE_ONEDAY_STATUSES = new Set(["booked", "입금대기", "등록대기", "입금완료", "등록완료"]);

function isActiveOneDayBooking(status?: string) {
  return ACTIVE_ONEDAY_STATUSES.has(String(status || ""));
}

function onedayStatusLabel(status?: string) {
  if (!status) return "-";
  return ONEDAY_STATUS_LABELS[status] || status;
}

type OneDayBookingMonthGroup = {
  key: string;
  label: string;
  bookings: OneDayBooking[];
};

type OneDayClassOption = {
  id: string;
  title: string;
  start_at?: string;
  end_at?: string;
};

function buildOneDayClassOptions(classes: OneDayClass[], bookings: OneDayBooking[]) {
  const map = new Map<string, OneDayClassOption>();

  for (const c of classes) {
    map.set(c.id, {
      id: c.id,
      title: c.title,
      start_at: c.start_at,
      end_at: c.end_at,
    });
  }

  for (const booking of bookings) {
    const id = booking.class_id || booking.oneday_classes?.id;
    if (!id) continue;
    if (!map.has(id)) {
      map.set(id, {
        id,
        title: booking.oneday_classes?.title || "제목 없는 원데이 클래스",
        start_at: booking.oneday_classes?.start_at,
        end_at: booking.oneday_classes?.end_at,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const aTime = a.start_at ? new Date(a.start_at).getTime() : 0;
    const bTime = b.start_at ? new Date(b.start_at).getTime() : 0;
    return bTime - aTime;
  });
}

function oneDayClassLabel(option: OneDayClassOption) {
  const date = option.start_at ? `${formatDateOnly(option.start_at)} ${formatTime(option.start_at)}` : "일정 없음";
  return `${date} · ${option.title}`;
}

function countOneDayStatuses(bookings: OneDayBooking[]) {
  const active = bookings.filter((booking) => isActiveOneDayBooking(booking.status));
  const waiting = active.filter((booking) => ["booked", "입금대기", "등록대기"].includes(String(booking.status || ""))).length;
  const confirmed = active.filter((booking) => ["입금완료", "등록완료"].includes(String(booking.status || ""))).length;
  const cancelled = bookings.filter((booking) => String(booking.status || "") === "cancelled").length;
  return { total: bookings.length, active: active.length, waiting, confirmed, cancelled };
}

function groupAdminOneDayBookingsByMonth(bookings: OneDayBooking[]) {
  const groups = new Map<string, OneDayBookingMonthGroup>();

  for (const booking of bookings) {
    const date = booking.oneday_classes?.start_at || booking.created_at || new Date(0).toISOString();
    const key = seoulMonthKey(date);
    if (!groups.has(key)) {
      groups.set(key, { key, label: formatMonthLabel(date), bookings: [] });
    }
    groups.get(key)!.bookings.push(booking);
  }

  return Array.from(groups.values())
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((group) => ({
      ...group,
      bookings: group.bookings.sort((a, b) => {
        const aDate = a.oneday_classes?.start_at || a.created_at || "";
        const bDate = b.oneday_classes?.start_at || b.created_at || "";
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      }),
    }));
}

function getOneDayMonthStats(bookings: OneDayBooking[]) {
  const activeBookings = bookings.filter((booking) => isActiveOneDayBooking(booking.status));
  const freeCount = activeBookings.filter((booking) => Number(booking.amount_due ?? 10000) === 0).length;
  const paidCount = activeBookings.filter((booking) => Number(booking.amount_due ?? 10000) > 0).length;
  const students = new Map<string, { name: string; phoneLast4: string; freeCount: number; paidCount: number; totalCount: number; paidAmount: number }>();

  for (const booking of activeBookings) {
    const key = `${booking.student_name || "이름 없음"}-${booking.phone_last4 || ""}`;
    if (!students.has(key)) {
      students.set(key, {
        name: booking.student_name || "이름 없음",
        phoneLast4: booking.phone_last4 || "-",
        freeCount: 0,
        paidCount: 0,
        totalCount: 0,
        paidAmount: 0,
      });
    }
    const item = students.get(key)!;
    item.totalCount += 1;
    if (Number(booking.amount_due ?? 10000) === 0) {
      item.freeCount += 1;
    } else {
      item.paidCount += 1;
      item.paidAmount += Number(booking.amount_due ?? 10000);
    }
  }

  return {
    activeCount: activeBookings.length,
    freeCount,
    paidCount,
    students: Array.from(students.values()).sort((a, b) => {
      if (b.paidCount !== a.paidCount) return b.paidCount - a.paidCount;
      return a.name.localeCompare(b.name, "ko-KR");
    }),
  };
}

function formatPrice(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

function formatOneDayAmount(value?: number | null) {
  if (value === 0) return "무료";
  return formatPrice(value ?? 10000);
}

/** ISO 시간을 한국 시간 기준 datetime-local 입력값으로 바꿉니다. */
function toSeoulDateTimeInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function seoulDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function todaySeoulDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function todaySeoulLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

function seoulParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(value));
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
  };
}

function buildCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const firstWeekday = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const days: Array<{ day: number | null; key: string | null }> = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    days.push({ day: null, key: null });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    days.push({ day, key });
  }

  while (days.length % 7 !== 0) {
    days.push({ day: null, key: null });
  }

  return days;
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [studentName, setStudentName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [memo, setMemo] = useState("");
  const [lessonCredits, setLessonCredits] = useState("4");
  const [lessonDurationMinutes, setLessonDurationMinutes] = useState("90");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [adjustedStartAt, setAdjustedStartAt] = useState("");
  const [adjustedLessonMinutes, setAdjustedLessonMinutes] = useState("90");
  const [generateStartDate, setGenerateStartDate] = useState("");
  const [generateWeeks, setGenerateWeeks] = useState("8");
  const [creditEdits, setCreditEdits] = useState<Record<string, string>>({});
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [studentEdits, setStudentEdits] = useState<Record<string, { name: string; phone_last4: string; memo: string; lesson_credits: string; lesson_duration_minutes: string; is_active: boolean }>>({});
  const [selectedHistoryStudentId, setSelectedHistoryStudentId] = useState("");
  const [historyTitle, setHistoryTitle] = useState("");
  const [historyDate, setHistoryDate] = useState("");
  const [historyMemo, setHistoryMemo] = useState("");
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [onedayTitle, setOnedayTitle] = useState("");
  const [onedayCurriculum, setOnedayCurriculum] = useState("");
  const [onedayStartAt, setOnedayStartAt] = useState("");
  const [onedayEndAt, setOnedayEndAt] = useState("");
  const [onedayRegularPrice, setOnedayRegularPrice] = useState("10000");
  const [onedayNormalPrice, setOnedayNormalPrice] = useState("30000");
  const [blockedTitle, setBlockedTitle] = useState("체험수업");
  const [blockedStartAt, setBlockedStartAt] = useState("");
  const [blockedEndAt, setBlockedEndAt] = useState("");
  const [blockedMemo, setBlockedMemo] = useState("");
  const [bookingCalendarMonth, setBookingCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [selectedBookingDate, setSelectedBookingDate] = useState<string | null>(null);
  const [selectedOneDayClassId, setSelectedOneDayClassId] = useState("all");
  const oneDayClassOptions = useMemo(
    () => buildOneDayClassOptions(overview?.classes || [], overview?.onedayBookings || []),
    [overview?.classes, overview?.onedayBookings],
  );
  const filteredOneDayBookings = useMemo(() => {
    const bookings = overview?.onedayBookings || [];
    if (selectedOneDayClassId === "all") return bookings;
    return bookings.filter((booking) => (booking.class_id || booking.oneday_classes?.id) === selectedOneDayClassId);
  }, [overview?.onedayBookings, selectedOneDayClassId]);
  const selectedOneDayClassOption = useMemo(
    () => oneDayClassOptions.find((option) => option.id === selectedOneDayClassId) || null,
    [oneDayClassOptions, selectedOneDayClassId],
  );
  const filteredOneDayStats = useMemo(
    () => countOneDayStatuses(filteredOneDayBookings),
    [filteredOneDayBookings],
  );
  const monthlyOneDayBookings = useMemo(
    () => groupAdminOneDayBookingsByMonth(filteredOneDayBookings),
    [filteredOneDayBookings],
  );

  async function loadOverview() {
    setMessage("");
    const res = await fetch("/api/admin/overview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "관리자 페이지에 들어갈 수 없습니다.");
      return;
    }
    setOverview(json);
    setActiveTab("dashboard");
    const nextEdits: Record<string, string> = {};
    const nextStudentEdits: Record<string, { name: string; phone_last4: string; memo: string; lesson_credits: string; lesson_duration_minutes: string; is_active: boolean }> = {};
    for (const student of json.students || []) {
      nextEdits[student.id] = String(student.lesson_credits ?? 0);
      nextStudentEdits[student.id] = {
        name: student.name || "",
        phone_last4: student.phone_last4 || "",
        memo: student.memo || "",
        lesson_credits: String(student.lesson_credits ?? 0),
        lesson_duration_minutes: String(student.lesson_duration_minutes ?? 90),
        is_active: student.is_active !== false,
      };
    }
    setCreditEdits(nextEdits);
    setStudentEdits(nextStudentEdits);
    if (!selectedHistoryStudentId && (json.students || []).length > 0) {
      setSelectedHistoryStudentId(json.students[0].id);
    }

    const bookings = (json.bookings || []) as Booking[];
    if (bookings.length > 0) {
      const first = [...bookings].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())[0];
      const key = seoulDateKey(first.start_at);
      const parts = seoulParts(first.start_at);
      setSelectedBookingDate((current) => current || key);
      setBookingCalendarMonth({ year: parts.year, month: parts.month });
    }
  }

  async function addStudent() {
    setMessage("");
    const res = await fetch("/api/admin/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        name: studentName,
        phone_last4: phoneLast4,
        memo,
        lesson_credits: Number(lessonCredits || 0),
        lesson_duration_minutes: Number(lessonDurationMinutes || 90),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "수강생을 등록할 수 없습니다.");
      return;
    }
    setStudentName(""); setPhoneLast4(""); setMemo(""); setLessonCredits("4"); setLessonDurationMinutes("90");
    setMessage("수강생을 등록했습니다.");
    await loadOverview();
    setActiveTab("students");
  }

  async function updateStudent(studentId: string) {
    const edit = studentEdits[studentId];
    if (!edit) return;
    setMessage("");
    const res = await fetch(`/api/admin/students/${studentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        name: edit.name,
        phone_last4: edit.phone_last4,
        memo: edit.memo,
        lesson_credits: Number(edit.lesson_credits || 0),
        lesson_duration_minutes: Number(edit.lesson_duration_minutes || 90),
        is_active: edit.is_active,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "수강생 정보를 수정할 수 없습니다.");
      return;
    }
    setEditingStudentId(null);
    setMessage("수강생 계정을 수정했습니다.");
    await loadOverview();
    setActiveTab("students");
  }

  function cancelStudentEdit(student: Student) {
    setStudentEdits((current) => ({
      ...current,
      [student.id]: {
        name: student.name,
        phone_last4: student.phone_last4,
        memo: student.memo || "",
        lesson_credits: String(student.lesson_credits ?? 0),
        lesson_duration_minutes: String(student.lesson_duration_minutes ?? 90),
        is_active: student.is_active !== false,
      },
    }));
    setEditingStudentId(null);
  }

  async function deleteStudent(studentId: string, studentName: string) {
    const ok = window.confirm(`${studentName} 수강생을 삭제할까요? 해당 수강생의 예약 기록도 함께 삭제될 수 있습니다.`);
    if (!ok) return;
    setMessage("");
    const res = await fetch(`/api/admin/students/${studentId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "수강생을 삭제할 수 없습니다.");
      return;
    }
    setMessage("수강생을 삭제했습니다.");
    await loadOverview();
    setActiveTab("students");
  }

  function openStudentHistory(studentId: string) {
    setSelectedHistoryStudentId(studentId);
    setEditingHistoryId(null);
    setHistoryTitle("");
    setHistoryDate("");
    setHistoryMemo("");
    openTab("history");
  }

  async function saveHistory() {
    setMessage("");
    const url = editingHistoryId ? `/api/admin/history/${editingHistoryId}` : "/api/admin/history";
    const res = await fetch(url, {
      method: editingHistoryId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        student_id: selectedHistoryStudentId,
        title: historyTitle,
        lesson_date: historyDate,
        memo: historyMemo,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "수강 기록을 저장할 수 없습니다.");
      return;
    }
    setHistoryTitle("");
    setHistoryDate("");
    setHistoryMemo("");
    setEditingHistoryId(null);
    setMessage(editingHistoryId ? "수강 기록을 수정했습니다." : "과거 수강 기록을 추가했습니다.");
    await loadOverview();
    setActiveTab("history");
  }

  function startHistoryEdit(history: LessonHistory) {
    setSelectedHistoryStudentId(history.student_id);
    setHistoryTitle(history.title);
    setHistoryDate(toSeoulDateTimeInput(history.lesson_date));
    setHistoryMemo(history.memo || "");
    setEditingHistoryId(history.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelHistoryEdit() {
    setEditingHistoryId(null);
    setHistoryTitle("");
    setHistoryDate("");
    setHistoryMemo("");
  }

  async function deleteHistory(historyId: string, title: string) {
    const ok = window.confirm(`${title} 수강 기록을 삭제할까요?`);
    if (!ok) return;
    setMessage("");
    const res = await fetch(`/api/admin/history/${historyId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "수강 기록을 삭제할 수 없습니다.");
      return;
    }
    setMessage("수강 기록을 삭제했습니다.");
    await loadOverview();
    setActiveTab("history");
  }

  async function addSlot() {
    setMessage("");
    const res = await fetch("/api/admin/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, start_at: startAt, end_at: endAt }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "예약 가능 시간을 등록할 수 없습니다.");
      return;
    }
    setStartAt(""); setEndAt("");
    setMessage("예약 가능 시간을 등록했습니다.");
    await loadOverview();
    setActiveTab("slots");
  }

  async function addAdjustedSlot() {
    setMessage("");
    const minutes = Number(adjustedLessonMinutes) === 120 ? 120 : 90;
    const adjustedEndAt = addMinutesToLocalDateTime(adjustedStartAt, minutes);
    if (!adjustedStartAt || !adjustedEndAt) {
      setMessage("조율 슬롯 시작 시간을 입력해 주세요.");
      return;
    }
    const res = await fetch("/api/admin/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, start_at: adjustedStartAt, end_at: adjustedEndAt }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "조율 슬롯을 등록할 수 없습니다.");
      return;
    }
    setAdjustedStartAt("");
    setAdjustedLessonMinutes("90");
    setMessage("조율 슬롯을 등록했습니다. 수강생 화면에는 실제로 가능한 수강생에게만 보입니다.");
    await loadOverview();
    setActiveTab("slots");
  }

  async function deleteSlot(slotId: string, startAt: string) {
    const ok = window.confirm(`${formatDateTime(startAt)} 예약 가능 시간을 삭제할까요? 이미 예약이 연결된 시간은 삭제되지 않습니다.`);
    if (!ok) return;
    setMessage("");
    const res = await fetch(`/api/admin/slots/${slotId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "예약 가능 시간을 삭제할 수 없습니다.");
      return;
    }
    setMessage("예약 가능 시간을 삭제했습니다.");
    await loadOverview();
    setActiveTab("slots");
  }

  async function addBlockedTime() {
    setMessage("");
    const res = await fetch("/api/admin/blocked-times", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        title: blockedTitle,
        start_at: blockedStartAt,
        end_at: blockedEndAt,
        memo: blockedMemo,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "외부 예약 시간을 차단할 수 없습니다.");
      return;
    }
    setBlockedTitle("체험수업");
    setBlockedStartAt("");
    setBlockedEndAt("");
    setBlockedMemo("");
    setMessage("외부 예약 시간을 차단했습니다.");
    await loadOverview();
    setActiveTab("blocks");
  }

  async function deleteBlockedTime(blockId: string, title: string) {
    const ok = window.confirm(`${title} 차단 일정을 삭제할까요?`);
    if (!ok) return;
    setMessage("");
    const res = await fetch(`/api/admin/blocked-times/${blockId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "차단 일정을 삭제할 수 없습니다.");
      return;
    }
    setMessage("차단 일정을 삭제했습니다.");
    await loadOverview();
    setActiveTab("blocks");
  }

  async function generateTimetable() {
    setMessage("");
    const res = await fetch("/api/admin/generate-slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, start_date: generateStartDate, weeks: Number(generateWeeks || 8) }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "기본 시간표를 만들 수 없습니다.");
      return;
    }
    setMessage(`기본 시간표를 만들었습니다. 새로 추가된 시간: ${json.count}개 / 확인한 시간: ${json.attempted}개`);
    await loadOverview();
    setActiveTab("slots");
  }

  async function addOnedayClass() {
    setMessage("");
    const res = await fetch("/api/admin/oneday", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        title: onedayTitle,
        curriculum: onedayCurriculum,
        start_at: onedayStartAt,
        end_at: onedayEndAt,
        regular_price: Number(onedayRegularPrice || 0),
        normal_price: Number(onedayNormalPrice || 0),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "원데이 클래스를 등록할 수 없습니다.");
      return;
    }
    setOnedayTitle("");
    setOnedayCurriculum("");
    setOnedayStartAt("");
    setOnedayEndAt("");
    setOnedayRegularPrice("10000");
    setOnedayNormalPrice("30000");
    setMessage("원데이 클래스를 등록했습니다. 정원은 5명으로 설정되었습니다.");
    await loadOverview();
    setActiveTab("oneday");
  }

  async function deleteOnedayClass(classId: string, title: string) {
    const ok = window.confirm(`${title} 원데이 클래스를 삭제할까요? 수강생 예약 화면에서는 더 이상 보이지 않습니다.`);
    if (!ok) return;
    setMessage("");
    const res = await fetch(`/api/admin/oneday/${classId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "원데이 클래스를 삭제할 수 없습니다.");
      return;
    }
    setMessage("원데이 클래스를 삭제했습니다.");
    await loadOverview();
    setActiveTab("oneday");
  }

  async function updateOneDayBookingStatus(bookingId: string, nextStatus: string, label: string) {
    const ok = window.confirm(`이 신청을 '${label}' 상태로 변경할까요?`);
    if (!ok) return;
    setMessage("");
    const res = await fetch(`/api/admin/oneday/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, status: nextStatus }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "원데이 신청 상태를 변경할 수 없습니다.");
      return;
    }
    setMessage(`원데이 신청을 '${label}' 상태로 변경했습니다.`);
    await loadOverview();
    setActiveTab("oneday");
  }

  const selectedHistoryStudent = useMemo(
    () => overview?.students.find((student) => student.id === selectedHistoryStudentId) || null,
    [overview?.students, selectedHistoryStudentId]
  );

  const selectedManualHistory = useMemo(() => {
    return [...(overview?.lessonHistory || [])]
      .filter((history) => history.student_id === selectedHistoryStudentId)
      .sort((a, b) => new Date(b.lesson_date).getTime() - new Date(a.lesson_date).getTime());
  }, [overview?.lessonHistory, selectedHistoryStudentId]);

  const selectedAutomaticHistory = useMemo(() => {
    return [...(overview?.bookings || [])]
      .filter((booking) => booking.student_id === selectedHistoryStudentId && new Date(booking.start_at).getTime() < Date.now())
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());
  }, [overview?.bookings, selectedHistoryStudentId]);

  const bookingsByDate = useMemo(() => {
    const grouped: Record<string, Booking[]> = {};
    for (const booking of overview?.bookings || []) {
      // 관리자 정규 예약 달력에서는 정상 취소(cancelled)는 숨깁니다.
      // 단, 6시간 이내 취소로 수강권이 차감된 late_cancelled 기록은 확인할 수 있게 유지합니다.
      if (booking.status === "cancelled") continue;
      const key = seoulDateKey(booking.start_at);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(booking);
    }
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    }
    return grouped;
  }, [overview?.bookings]);

  const bookingCalendarDays = useMemo(
    () => buildCalendarDays(bookingCalendarMonth.year, bookingCalendarMonth.month),
    [bookingCalendarMonth]
  );

  const selectedBookings = selectedBookingDate ? bookingsByDate[selectedBookingDate] || [] : [];

  const upcomingBookings = useMemo(() => {
    const now = Date.now();
    return [...(overview?.bookings || [])]
      .filter((booking) => new Date(booking.start_at).getTime() >= now && booking.status !== "cancelled" && booking.status !== "late_cancelled")
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
      .slice(0, 5);
  }, [overview?.bookings]);

  const activeBookingsCount = (overview?.bookings || []).filter((booking) => booking.status !== "cancelled" && booking.status !== "late_cancelled").length;

  const todayKey = todaySeoulDateKey();
  const todayLabel = todaySeoulLabel();

  const todayScheduleItems = useMemo<TodayScheduleItem[]>(() => {
    if (!overview) return [];

    const items: TodayScheduleItem[] = [];

    for (const booking of overview.bookings || []) {
      if (booking.status === "cancelled" || booking.status === "late_cancelled") continue;
      if (seoulDateKey(booking.start_at) !== todayKey) continue;

      items.push({
        id: `regular-${booking.id}`,
        type: "regular",
        start_at: booking.start_at,
        end_at: booking.end_at,
        label: "정규수업",
        title: booking.students?.name || "이름 없음",
        subtitle: `${booking.students?.phone_last4 || "번호 없음"} · ${STATUS_LABELS[booking.status] || booking.status}`,
        detail: booking.memo || undefined,
      });
    }

    for (const block of overview.blockedTimes || []) {
      if (seoulDateKey(block.start_at) !== todayKey) continue;

      items.push({
        id: `block-${block.id}`,
        type: "block",
        start_at: block.start_at,
        end_at: block.end_at,
        label: "외부/체험",
        title: block.title || "외부 차단",
        subtitle: block.memo || "관리자가 차단한 일정입니다.",
      });
    }

    for (const klass of overview.classes || []) {
      if (seoulDateKey(klass.start_at) !== todayKey) continue;

      const relatedBookings = (overview.onedayBookings || []).filter((booking) => {
        const classId = booking.class_id || booking.oneday_classes?.id;
        return classId === klass.id && isActiveOneDayBooking(booking.status);
      });
      const confirmedCount = relatedBookings.filter((booking) => ["입금완료", "등록완료"].includes(String(booking.status || ""))).length;

      items.push({
        id: `oneday-${klass.id}`,
        type: "oneday",
        start_at: klass.start_at,
        end_at: klass.end_at,
        label: "원데이",
        title: klass.title || "원데이 클래스",
        subtitle: `신청 ${relatedBookings.length}명 / 확정 ${confirmedCount}명 / 정원 ${klass.capacity || 0}명`,
        detail: klass.description || undefined,
      });
    }

    return items.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [overview, todayKey]);

  const todayCounts = useMemo(() => ({
    regular: todayScheduleItems.filter((item) => item.type === "regular").length,
    block: todayScheduleItems.filter((item) => item.type === "block").length,
    oneday: todayScheduleItems.filter((item) => item.type === "oneday").length,
  }), [todayScheduleItems]);

  const bookedSlotIds = useMemo(() => {
    return new Set(
      (overview?.bookings || [])
        .filter((booking) => booking.status !== "cancelled" && booking.status !== "late_cancelled")
        .map((booking) => booking.slot_id)
        .filter(Boolean) as string[]
    );
  }, [overview?.bookings]);

  function moveBookingMonth(direction: -1 | 1) {
    setBookingCalendarMonth((current) => {
      const date = new Date(current.year, current.month - 1 + direction, 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    });
  }

  function openTab(tab: AdminTab) {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function isTopMenuActive(tab: AdminTab) {
    if (tab === "schedule") return SCHEDULE_TABS.includes(activeTab);
    if (tab === "students") return STUDENT_TABS.includes(activeTab);
    return activeTab === tab;
  }

  return (
    <main className="container">
      <Link href="/" className="small">← 처음으로</Link>
      <section className="card">
        <h1>관리자 페이지</h1>
        <p>관리자 비밀번호를 입력해 주세요.</p>
        <label>관리자 비밀번호</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="관리자 비밀번호" />
        <button onClick={loadOverview}>관리자 페이지 열기</button>
        {message && <p className={message.includes("등록") || message.includes("변경") || message.includes("삭제") || message.includes("만들") ? "success" : "error"}>{message}</p>}
      </section>

      {overview && (
        <>
          <section className="card adminTabsCard">
            <div className="adminTabs">
              {TAB_LABELS.map((tab) => (
                <button
                  key={tab.id}
                  className={`tabButton ${isTopMenuActive(tab.id) ? "active" : ""}`}
                  onClick={() => openTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          {activeTab === "dashboard" && (
            <>
              <section className="card todayCard">
                <div className="sectionHeaderRow">
                  <div>
                    <p className="eyebrow">오늘의 수업</p>
                    <h2>{todayLabel}</h2>
                    <p className="small">정규수업, 외부 차단/체험수업, 원데이 클래스를 한 번에 확인합니다.</p>
                  </div>
                  <Link href="/admin/schedule" className="scheduleLink">통합 스케줄 보기</Link>
                </div>

                <div className="todaySummaryGrid">
                  <div className="todaySummaryBox regular"><span>정규수업</span><strong>{todayCounts.regular}건</strong></div>
                  <div className="todaySummaryBox block"><span>외부/체험</span><strong>{todayCounts.block}건</strong></div>
                  <div className="todaySummaryBox oneday"><span>원데이</span><strong>{todayCounts.oneday}건</strong></div>
                </div>

                <div className="todayTimeline">
                  {todayScheduleItems.length === 0 && (
                    <div className="emptyToday">
                      <strong>오늘 등록된 수업 일정이 없습니다.</strong>
                      <p>정규 예약, 외부 차단, 원데이 클래스가 생기면 이곳에 시간순으로 표시됩니다.</p>
                    </div>
                  )}
                  {todayScheduleItems.map((item) => (
                    <div className={`todayItem ${item.type}`} key={item.id}>
                      <div className="todayTime">
                        <strong>{formatTime(item.start_at)}</strong>
                        <span>{formatTime(item.end_at)}</span>
                      </div>
                      <div className="todayContent">
                        <span className={`todayBadge ${item.type}`}>{item.label}</span>
                        <strong>{item.title}</strong>
                        <p>{item.subtitle}</p>
                        {item.detail && <p className="todayMemo">{item.detail}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card">
                <h2>홈</h2>
                <div className="statsGrid">
                  <div className="statBox"><span>정규 수강생</span><strong>{overview.students.length}명</strong></div>
                  <div className="statBox"><span>예약 가능 시간</span><strong>{overview.slots.length}개</strong></div>
                  <div className="statBox"><span>정규 예약</span><strong>{activeBookingsCount}건</strong></div>
                  <div className="statBox"><span>원데이 신청</span><strong>{overview.onedayBookings.length}건</strong></div>
                  <div className="statBox"><span>외부 차단</span><strong>{overview.blockedTimes?.length || 0}건</strong></div>
                </div>
                <h3>다가오는 정규수업</h3>
                <div className="list">
                  {upcomingBookings.length === 0 && <p>다가오는 정규수업 예약이 없습니다.</p>}
                  {upcomingBookings.map((b) => (
                    <div className="item" key={b.id}>
                      <strong>{formatDateTime(b.start_at)} - {formatTime(b.end_at)}</strong>
                      <p>{b.students?.name || "이름 없음"} / {b.students?.phone_last4 || "번호 없음"} / 상태: {STATUS_LABELS[b.status] || b.status}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {activeTab === "schedule" && (
            <>
              <section className="card">
                <h2>스케줄</h2>
                <p className="small">정규수업 예약, 원데이 클래스, 외부 차단, 예약 가능 시간을 한 곳에서 확인하고 관리합니다.</p>
                <div className="statsGrid">
                  <div className="statBox"><span>정규 예약</span><strong>{activeBookingsCount}건</strong></div>
                  <div className="statBox"><span>예약 가능 시간</span><strong>{overview.slots.length}개</strong></div>
                  <div className="statBox"><span>외부 차단</span><strong>{overview.blockedTimes?.length || 0}건</strong></div>
                  <div className="statBox"><span>원데이 일정</span><strong>{overview.classes.length}개</strong></div>
                </div>
              </section>

              <section className="card">
                <h2>스케줄 관리 메뉴</h2>
                <p className="small">평소에는 통합 스케줄을 먼저 확인하고, 필요한 작업만 아래 버튼으로 들어가면 됩니다.</p>
                <div className="adminQuickGrid">
                  <Link href="/admin/schedule" className="quickCard">
                    <strong>통합 스케줄</strong>
                    <span>정규수업·원데이·외부 차단을 한 화면에서 확인</span>
                  </Link>
                  <button className="quickCard" onClick={() => openTab("timetable")}>
                    <strong>시간표 만들기</strong>
                    <span>기본 시간표와 조율 슬롯 생성</span>
                  </button>
                  <button className="quickCard" onClick={() => openTab("slots")}>
                    <strong>예약 가능 시간</strong>
                    <span>수강생에게 열릴 수 있는 시간 확인·삭제</span>
                  </button>
                  <button className="quickCard" onClick={() => openTab("blocks")}>
                    <strong>외부 차단</strong>
                    <span>네이버 예약·상담·개인 일정 차단</span>
                  </button>
                  <button className="quickCard" onClick={() => openTab("bookings")}>
                    <strong>정규 예약 달력</strong>
                    <span>날짜별 정규수업 예약자 확인</span>
                  </button>
                </div>
              </section>

              <section className="card">
                <h2>다가오는 정규수업</h2>
                <div className="list">
                  {upcomingBookings.length === 0 && <p>다가오는 정규수업 예약이 없습니다.</p>}
                  {upcomingBookings.map((b) => (
                    <div className="item" key={b.id}>
                      <strong>{formatDateTime(b.start_at)} - {formatTime(b.end_at)}</strong>
                      <p>{b.students?.name || "이름 없음"} / {b.students?.phone_last4 || "번호 없음"} / 상태: {STATUS_LABELS[b.status] || b.status}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {activeTab === "students" && (
            <>
              <section className="card compactMenuCard">
                <h2>수강생</h2>
                <p className="small">수강생 등록, 계정 수정, 수강권 관리는 여기서 처리합니다. 지난 수업 기록은 아래 버튼으로 이동할 수 있습니다.</p>
                <div className="row">
                  <button className="secondary compact activeSoft">수강생 관리</button>
                  <button className="secondary compact" onClick={() => openTab("history")}>수강 기록</button>
                </div>
              </section>
              <section className="card">
                <h2>정규 수강생 등록</h2>
                <label>이름</label>
                <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="예: 김문장" />
                <label>핸드폰번호 뒷자리 4자리</label>
                <input value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value)} placeholder="예: 6789" maxLength={4} />
                <label>수강권 잔여 횟수</label>
                <input type="number" min="0" value={lessonCredits} onChange={(e) => setLessonCredits(e.target.value)} placeholder="예: 4" />
                <label>정규수업 유형</label>
                <select value={lessonDurationMinutes} onChange={(e) => setLessonDurationMinutes(e.target.value)}>
                  <option value="90">90분 수강생</option>
                  <option value="120">120분 수강생</option>
                </select>
                <p className="small">관리자가 정하는 수강생별 수업 유형입니다. 수강생은 예약할 때 90분/120분을 직접 선택하지 않습니다. 이 선택은 2026년 7월 1일부터 적용되고, 2026년 6월 30일까지는 기존대로 80분 수업으로 운영됩니다.</p>
                <label>메모</label>
                <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 주 1회 정규수업" />
                <button onClick={addStudent}>수강생 등록</button>
              </section>

              <section className="card">
                <h2>수강생 목록</h2>
                <p className="small">각 수강생의 ‘계정 수정’을 누르면 이름, 전화번호 뒷자리, 수강권, 메모, 이용 상태를 한 번에 수정할 수 있습니다.</p>
                <div className="list">
                  {overview.students.map((s) => {
                    const edit = studentEdits[s.id] || { name: s.name, phone_last4: s.phone_last4, memo: s.memo || "", lesson_credits: String(s.lesson_credits ?? 0), lesson_duration_minutes: String(s.lesson_duration_minutes ?? 90), is_active: s.is_active !== false };
                    const isEditing = editingStudentId === s.id;
                    return (
                      <div className="item" key={s.id}>
                        {!isEditing ? (
                          <>
                            <div className="row between">
                              <div>
                                <strong>{s.name}</strong> / {s.phone_last4}
                                <p className="small">수강권: {s.lesson_credits ?? 0}회 / 정규수업 유형: {s.lesson_duration_minutes ?? 90}분 / 상태: {s.is_active ? "이용 중" : "이용 중지"}</p>
                                <p className="small">메모: {s.memo || "-"}</p>
                              </div>
                              <div className="row itemActions">
                                <button className="secondary compact" onClick={() => setEditingStudentId(s.id)}>계정 수정</button>
                                <button className="secondary compact" onClick={() => openStudentHistory(s.id)}>수강 기록</button>
                                <button className="danger compact" onClick={() => deleteStudent(s.id, s.name)}>삭제</button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="editPanel">
                            <h3>{s.name} 계정 수정</h3>
                            <label>이름</label>
                            <input value={edit.name} onChange={(e) => setStudentEdits((current) => ({ ...current, [s.id]: { ...edit, name: e.target.value } }))} />
                            <label>핸드폰번호 뒷자리 4자리</label>
                            <input maxLength={4} value={edit.phone_last4} onChange={(e) => setStudentEdits((current) => ({ ...current, [s.id]: { ...edit, phone_last4: e.target.value } }))} />
                            <label>수강권 잔여 횟수</label>
                            <input type="number" min="0" value={edit.lesson_credits} onChange={(e) => setStudentEdits((current) => ({ ...current, [s.id]: { ...edit, lesson_credits: e.target.value } }))} />
                            <label>정규수업 유형</label>
                            <select value={edit.lesson_duration_minutes} onChange={(e) => setStudentEdits((current) => ({ ...current, [s.id]: { ...edit, lesson_duration_minutes: e.target.value } }))}>
                              <option value="90">90분 수강생</option>
                              <option value="120">120분 수강생</option>
                            </select>
                            <label>메모</label>
                            <textarea rows={3} value={edit.memo} onChange={(e) => setStudentEdits((current) => ({ ...current, [s.id]: { ...edit, memo: e.target.value } }))} />
                            <label className="checkboxLabel">
                              <input type="checkbox" checked={edit.is_active} onChange={(e) => setStudentEdits((current) => ({ ...current, [s.id]: { ...edit, is_active: e.target.checked } }))} />
                              예약 사이트 이용 가능
                            </label>
                            <div className="row">
                              <button onClick={() => updateStudent(s.id)}>저장</button>
                              <button className="secondary" onClick={() => cancelStudentEdit(s)}>취소</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {activeTab === "history" && (
            <>
              <section className="card compactMenuCard">
                <h2>수강생</h2>
                <p className="small">수강생별 지난 수업 내용과 자동 저장된 예약 기록을 확인합니다.</p>
                <div className="row">
                  <button className="secondary compact" onClick={() => openTab("students")}>수강생 관리</button>
                  <button className="secondary compact activeSoft">수강 기록</button>
                </div>
              </section>
              <section className="card">
                <h2>수강생별 과거 수강 기록 입력</h2>
                <p className="small">예약 시스템을 쓰기 전에 들었던 수업이나 별도로 진행한 수업을 직접 기록할 수 있습니다. 입력한 내용은 수강생의 ‘내 수강 기록’ 화면에도 표시됩니다.</p>
                <label>수강생 선택</label>
                <select value={selectedHistoryStudentId} onChange={(e) => { setSelectedHistoryStudentId(e.target.value); cancelHistoryEdit(); }}>
                  <option value="">수강생을 선택해 주세요</option>
                  {overview.students.map((student) => (
                    <option key={student.id} value={student.id}>{student.name} / {student.phone_last4}</option>
                  ))}
                </select>
                <label>수업명</label>
                <input value={historyTitle} onChange={(e) => setHistoryTitle(e.target.value)} placeholder="예: 성인 기초 글쓰기 1회차" />
                <label>수업 일정 <span className="small">(한국 시간 기준)</span></label>
                <input type="datetime-local" value={historyDate} onChange={(e) => setHistoryDate(e.target.value)} />
                <label>수업 내용 및 메모</label>
                <textarea rows={4} value={historyMemo} onChange={(e) => setHistoryMemo(e.target.value)} placeholder="예: 자기소개 에세이 초안 작성 및 문장 첨삭" />
                <div className="row">
                  <button onClick={saveHistory} disabled={!selectedHistoryStudentId}>{editingHistoryId ? "수강 기록 수정" : "과거 수강 기록 추가"}</button>
                  {editingHistoryId && <button className="secondary" onClick={cancelHistoryEdit}>수정 취소</button>}
                </div>
              </section>

              <section className="card">
                <h2>{selectedHistoryStudent ? `${selectedHistoryStudent.name}님의 수강 기록` : "수강 기록 목록"}</h2>
                {!selectedHistoryStudent && <p>위에서 수강생을 선택해 주세요.</p>}
                {selectedHistoryStudent && (
                  <>
                    <h3>관리자가 직접 입력한 기록</h3>
                    <div className="list">
                      {selectedManualHistory.length === 0 && <p>직접 입력한 수강 기록이 없습니다.</p>}
                      {selectedManualHistory.map((history) => (
                        <div className="item" key={history.id}>
                          <div className="row between">
                            <div>
                              <strong>{history.title}</strong>
                              <p className="small">{formatDateTime(history.lesson_date)}</p>
                              {history.memo && <p>{history.memo}</p>}
                            </div>
                            <div className="row itemActions">
                              <button className="secondary compact" onClick={() => startHistoryEdit(history)}>수정</button>
                              <button className="danger compact" onClick={() => deleteHistory(history.id, history.title)}>삭제</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <h3>예약으로 자동 저장된 지난 수업</h3>
                    <div className="list">
                      {selectedAutomaticHistory.length === 0 && <p>예약으로 저장된 지난 수업이 없습니다.</p>}
                      {selectedAutomaticHistory.map((booking) => (
                        <div className="item" key={booking.id}>
                          <strong>{formatDateTime(booking.start_at)} - {formatTime(booking.end_at)}</strong>
                          <p className="small">상태: {STATUS_LABELS[booking.status] || booking.status}</p>
                          {booking.memo && <p className="small">메모: {booking.memo}</p>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </section>
            </>
          )}

          {activeTab === "timetable" && (
            <>
              <section className="card compactMenuCard">
                <h2>스케줄 &gt; 시간표 만들기</h2>
                <button className="secondary compact" onClick={() => openTab("schedule")}>← 스케줄 메뉴로</button>
              </section>
              <section className="card">
                <h2>기본 타임테이블 자동 생성</h2>
                <p className="small">월-금 14:00-20:30, 토 10:00-16:30 사이를 30분 단위로 엽니다. 2026년 6월 30일까지는 80분 수업 + 10분 휴식, 2026년 7월 1일부터는 수강생별 90분/120분 수업 + 30분 휴식으로 자동 계산됩니다. 이미 있는 시간은 중복 등록되지 않습니다.</p>
                <label>시작 날짜</label>
                <input type="date" value={generateStartDate} onChange={(e) => setGenerateStartDate(e.target.value)} />
                <label>몇 주치 만들까요?</label>
                <input type="number" min="1" max="26" value={generateWeeks} onChange={(e) => setGenerateWeeks(e.target.value)} />
                <button onClick={generateTimetable}>기본 시간표 만들기</button>
              </section>

              <section className="card">
                <h2>예약 가능 시간 직접 등록</h2>
                <p className="small">일반적으로 추가할 시간만 직접 등록해 주세요. 종료 시간은 임시값으로 입력해도 예약 시 수강생 유형과 날짜 기준에 맞춰 자동 계산됩니다.</p>
                <label>시작 시간</label>
                <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                <label>수업 종료 시간</label>
                <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                <button onClick={addSlot}>시간 등록</button>
              </section>

              <section className="card">
                <h2>일정 조율 슬롯 등록</h2>
                <p className="small">예: 7월 2일 15:30-17:30 수업 후, 19:30 원데이 전까지 17:50-19:20에 90분 수업을 하나 더 열고 싶을 때 사용하세요. 조율 슬롯은 1분 단위로 열 수 있고, 일반 30분 슬롯보다 유연하게 정규수업 사이 20분 휴식을 허용합니다.</p>
                <label>조율 슬롯 시작 시간 <span className="small">(한국 시간 기준, 1분 단위)</span></label>
                <input type="datetime-local" value={adjustedStartAt} onChange={(e) => setAdjustedStartAt(e.target.value)} />
                <label>조율할 수업 유형</label>
                <select value={adjustedLessonMinutes} onChange={(e) => setAdjustedLessonMinutes(e.target.value)}>
                  <option value="90">90분 수업</option>
                  <option value="120">120분 수업</option>
                </select>
                {adjustedStartAt && (
                  <p className="small">예상 수업 시간: {adjustedStartAt.replace("T", " ")} - {addMinutesToLocalDateTime(adjustedStartAt, Number(adjustedLessonMinutes) === 120 ? 120 : 90).replace("T", " ")}</p>
                )}
                <button onClick={addAdjustedSlot}>조율 슬롯 등록</button>
              </section>
            </>
          )}

          {activeTab === "slots" && (
            <section className="card">
              <div className="row between">
                <h2>예약 가능 시간 목록</h2>
                <button className="secondary compact" onClick={() => openTab("schedule")}>← 스케줄 메뉴로</button>
              </div>
              <p className="small">수강생 화면에 열릴 수 있는 시간 목록입니다. 이미 예약과 겹치거나 수업 6시간 이내인 시간은 수강생 화면에서 자동으로 제외됩니다. 예약이 연결되지 않은 시간은 삭제할 수 있습니다.</p>
              <div className="list">
                {overview.slots.length === 0 && <p>등록된 예약 가능 시간이 없습니다.</p>}
                {overview.slots.map((slot) => {
                  const hasBooking = bookedSlotIds.has(slot.id);
                  return (
                    <div className="item" key={slot.id}>
                      <div className="row between">
                        <div>
                          <strong>{formatDateTime(slot.start_at)}</strong>
                          <p className="small">수업 종료: {formatDateTime(slot.end_at)} / 열림: {String(slot.is_open)} / 예약 상태: {hasBooking ? "예약 있음" : "비어 있음"}</p>
                        </div>
                        <button
                          className="danger compact"
                          onClick={() => deleteSlot(slot.id, slot.start_at)}
                          disabled={hasBooking}
                          title={hasBooking ? "이미 예약이 연결된 시간은 삭제할 수 없습니다." : "예약 가능 시간 삭제"}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {activeTab === "blocks" && (
            <>
              <section className="card compactMenuCard">
                <h2>스케줄 &gt; 외부 차단</h2>
                <button className="secondary compact" onClick={() => openTab("schedule")}>← 스케줄 메뉴로</button>
              </section>
              <section className="card">
                <h2>외부 예약 시간 차단</h2>
                <p className="small">네이버 예약으로 들어온 체험수업, 상담, 신규수강생 수업, 개인 일정 등을 1분 단위로 막아둘 수 있습니다. 차단된 시간과 겹치는 정규수업 예약 슬롯은 수강생 화면에서 자동으로 숨겨집니다.</p>
                <label>차단 사유</label>
                <input value={blockedTitle} onChange={(e) => setBlockedTitle(e.target.value)} placeholder="예: 체험수업, 상담, 외부 일정" />
                <label>차단 시작 시간 <span className="small">(한국 시간 기준, 1분 단위)</span></label>
                <input type="datetime-local" value={blockedStartAt} onChange={(e) => setBlockedStartAt(e.target.value)} />
                <label>차단 종료 시간 <span className="small">(한국 시간 기준, 1분 단위)</span></label>
                <input type="datetime-local" value={blockedEndAt} onChange={(e) => setBlockedEndAt(e.target.value)} />
                <label>메모</label>
                <textarea rows={3} value={blockedMemo} onChange={(e) => setBlockedMemo(e.target.value)} placeholder="예: 네이버 예약 신규 체험수업 / 입금 확인 완료" />
                <button onClick={addBlockedTime}>외부 예약 시간 차단</button>
              </section>

              <section className="card">
                <h2>차단된 외부 예약 시간</h2>
                <p className="small">등록된 차단 시간은 수강생 정규수업 예약 가능 시간 계산에 바로 반영됩니다.</p>
                <div className="list">
                  {(overview.blockedTimes || []).length === 0 && <p>차단된 외부 예약 시간이 없습니다.</p>}
                  {(overview.blockedTimes || []).map((block) => (
                    <div className="item" key={block.id}>
                      <div className="row between">
                        <div>
                          <strong>{block.title}</strong>
                          <p className="small">{formatDateOnly(block.start_at)} {formatTime(block.start_at)} - {formatTime(block.end_at)}</p>
                          {block.memo && <p>{block.memo}</p>}
                        </div>
                        <button className="danger compact" onClick={() => deleteBlockedTime(block.id, block.title)}>삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {activeTab === "bookings" && (
            <section className="card">
              <div className="row between">
                <h2>정규수업 예약 달력</h2>
                <button className="secondary compact" onClick={() => openTab("schedule")}>← 스케줄 메뉴로</button>
              </div>
              <p className="small">예약된 정규수업을 날짜별로 확인할 수 있습니다. 정상 취소된 예약은 숨기고, 수강권이 차감된 취소건만 표시합니다.</p>
              <div className="calendarHeader">
                <button className="secondary compact" onClick={() => moveBookingMonth(-1)}>이전 달</button>
                <h2>{bookingCalendarMonth.year}년 {bookingCalendarMonth.month}월</h2>
                <button className="secondary compact" onClick={() => moveBookingMonth(1)}>다음 달</button>
              </div>
              <div className="calendarWeekdays">
                <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
              </div>
              <div className="calendarGrid">
                {bookingCalendarDays.map((day, index) => {
                  const dateBookings = day.key ? bookingsByDate[day.key] || [] : [];
                  const hasBookings = dateBookings.length > 0;
                  return (
                    <button
                      key={`${day.key || "empty"}-${index}`}
                      className={`calendarDay ${hasBookings ? "hasSlots" : ""} ${selectedBookingDate === day.key ? "selected" : ""}`}
                      disabled={!day.key || !hasBookings}
                      onClick={() => day.key && setSelectedBookingDate(day.key)}
                    >
                      <span className="dayNumber">{day.day || ""}</span>
                      {hasBookings && <span className="slotBadge">{dateBookings.length}건</span>}
                    </button>
                  );
                })}
              </div>
              <div className="selectedSlots">
                <h3>{selectedBookingDate || "날짜를 선택해 주세요"}</h3>
                <div className="list">
                  {selectedBookings.length === 0 && <p>선택한 날짜의 예약이 없습니다.</p>}
                  {selectedBookings.map((b) => (
                    <div className="item" key={b.id}>
                      <strong>{formatTime(b.start_at)} - {formatTime(b.end_at)}</strong>
                      <p>{b.students?.name || "이름 없음"} / {b.students?.phone_last4 || "번호 없음"} / 상태: {STATUS_LABELS[b.status] || b.status}</p>
                      {b.memo && <p className="small">메모: {b.memo}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeTab === "settings" && (
            <section className="card">
              <h2>설정</h2>
              <p className="small">자주 바꾸는 운영 규칙을 한 곳에 모아두는 자리입니다. 현재 버전에서는 아래 항목을 확인용으로 정리해 두고, 실제 변경은 기존 관리 기능에서 처리합니다.</p>
              <div className="list">
                <div className="item">
                  <strong>예약/취소 규칙</strong>
                  <p className="small">수업 6시간 전까지 예약·취소 가능, 이후 취소 시 수강권 차감.</p>
                </div>
                <div className="item">
                  <strong>정규수업 운영</strong>
                  <p className="small">수강생별 90분/120분 수업 유형을 수강생 관리에서 지정합니다.</p>
                </div>
                <div className="item">
                  <strong>스케줄 관리</strong>
                  <p className="small">예약 가능 시간, 외부 차단, 정규 예약 달력은 스케줄 메뉴 안으로 묶었습니다.</p>
                </div>
              </div>
            </section>
          )}

          {activeTab === "oneday" && (
            <>
              <section className="card">
                <h2>원데이 클래스 추가</h2>
                <p className="small">정원은 자동으로 5명으로 등록됩니다. 커리큘럼에는 수업 안내문에 보여줄 내용을 적어 주세요.</p>
                <label>제목</label>
                <input value={onedayTitle} onChange={(e) => setOnedayTitle(e.target.value)} placeholder="예: 자서전쓰기 원데이 클래스" />
                <label>커리큘럼</label>
                <textarea value={onedayCurriculum} onChange={(e) => setOnedayCurriculum(e.target.value)} placeholder="예: 1. 기억 꺼내기 2. 장면 정리하기 3. 짧은 자서전 초안 쓰기" rows={5} />
                <label>수업 시작 일정</label>
                <input type="datetime-local" value={onedayStartAt} onChange={(e) => setOnedayStartAt(e.target.value)} />
                <label>수업 종료 일정</label>
                <input type="datetime-local" value={onedayEndAt} onChange={(e) => setOnedayEndAt(e.target.value)} />
                <label>유료 수강 비용</label>
                <input type="number" min="0" value={onedayRegularPrice} onChange={(e) => setOnedayRegularPrice(e.target.value)} placeholder="예: 10000" />
                <p className="small">정규수강생은 매월 원데이 1회 무료, 같은 달 2회차부터 위 금액이 적용됩니다.</p>
                <button onClick={addOnedayClass}>원데이 클래스 추가</button>
              </section>

              <section className="card">
                <h2>원데이 클래스 목록</h2>
                <div className="list">
                  {overview.classes.length === 0 && <p>등록된 원데이 클래스가 없습니다.</p>}
                  {overview.classes.map((c) => (
                    <div className="item" key={c.id}>
                      <div className="row between">
                        <div>
                          <strong>{c.title}</strong>
                          <p className="small">{formatDateOnly(c.start_at)} {formatTime(c.start_at)} - {formatTime(c.end_at)} / 정원 5명</p>
                          <p className="small">비용: 월 1회 무료 / 이후 {formatPrice(c.regular_price ?? 10000)}</p>
                          {c.description && <p>커리큘럼: {c.description}</p>}
                        </div>
                        <button className="danger compact" onClick={() => deleteOnedayClass(c.id, c.title)}>삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card">
                <h2>원데이 신청자 확인</h2>
                <p className="small">전체 신청 내역을 한 번에 보거나, 수업을 선택해서 해당 클래스 신청자만 확인할 수 있습니다.</p>
                <label>수업별 신청자 보기</label>
                <select value={selectedOneDayClassId} onChange={(e) => setSelectedOneDayClassId(e.target.value)}>
                  <option value="all">전체 원데이 신청 내역</option>
                  {oneDayClassOptions.map((option) => (
                    <option value={option.id} key={option.id}>{oneDayClassLabel(option)}</option>
                  ))}
                </select>
                <div className="benefitSummary">
                  <span className="benefitPill">총 {filteredOneDayStats.total}건</span>
                  <span className="benefitPill">활성 신청 {filteredOneDayStats.active}건</span>
                  <span className="benefitPill">대기 {filteredOneDayStats.waiting}건</span>
                  <span className="benefitPill">등록 완료 {filteredOneDayStats.confirmed}건</span>
                  {filteredOneDayStats.cancelled > 0 && <span className="benefitPill">취소 {filteredOneDayStats.cancelled}건</span>}
                </div>
                {selectedOneDayClassOption && (
                  <div className="selectedClassBox">
                    <strong>{selectedOneDayClassOption.title}</strong>
                    {selectedOneDayClassOption.start_at && (
                      <p className="small">{formatDateOnly(selectedOneDayClassOption.start_at)} {formatTime(selectedOneDayClassOption.start_at)}{selectedOneDayClassOption.end_at ? ` - ${formatTime(selectedOneDayClassOption.end_at)}` : ""}</p>
                    )}
                    <p className="small">선택한 수업의 신청자만 아래에 표시됩니다.</p>
                  </div>
                )}
                <div className="list">
                  {overview.onedayBookings.length === 0 && <p>원데이 신청 내역이 없습니다.</p>}
                  {overview.onedayBookings.length > 0 && filteredOneDayBookings.length === 0 && <p>선택한 수업의 신청자가 없습니다.</p>}
                  {monthlyOneDayBookings.map((group) => {
                    const stats = getOneDayMonthStats(group.bookings);
                    return (
                    <div className="monthGroup" key={group.key}>
                      <h3>{group.label}</h3>
                      <p className="small">무료 혜택 사용 {stats.freeCount}건 / 추가 유료 신청 {stats.paidCount}건 / 활성 신청 {stats.activeCount}건</p>
                      {stats.paidCount > 0 && <p className="paymentNotice">추가 수강료 입금 안내가 필요한 신청이 {stats.paidCount}건 있습니다.</p>}
                      {stats.students.length > 0 && (
                        <div className="benefitSummary">
                          {stats.students.map((student) => (
                            <span className="benefitPill" key={`${group.key}-${student.name}-${student.phoneLast4}`}>
                              {student.name}({student.phoneLast4}) · 무료 {student.freeCount}회 · 추가 {student.paidCount}회
                              {student.paidCount > 0 ? ` · 입금 안내 ${formatPrice(student.paidAmount)}` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="list compactList">
                        {group.bookings.map((b) => (
                          <div className="item" key={b.id}>
                            <strong>{b.student_name}</strong>
                            <p className="small">클래스: {b.oneday_classes?.title || "-"}</p>
                            {b.oneday_classes?.start_at && (
                              <p className="small">일정: {formatDateOnly(b.oneday_classes.start_at)} {formatTime(b.oneday_classes.start_at)}{b.oneday_classes.end_at ? ` - ${formatTime(b.oneday_classes.end_at)}` : ""}</p>
                            )}
                            <p className="small">인원: {b.people_count || 1}명 / 상태: {onedayStatusLabel(b.status)}</p>
                            <p className="small">적용 비용: {formatOneDayAmount(b.amount_due)}</p>
                            <p className="small">월 무료 혜택: {Number(b.amount_due ?? 10000) === 0 ? "사용" : "추가 유료 신청"}</p>
                            {Number(b.amount_due ?? 10000) > 0 && ["booked", "입금대기"].includes(String(b.status || "")) && (
                              <p className="paymentNotice">추가 수강료 {formatOneDayAmount(b.amount_due)} 입금 안내 필요</p>
                            )}
                            <p className="small">연락처 뒷자리: {b.phone_last4 || "-"}</p>
                            <div className="inlineActions smallActionRow">
                              {["booked", "입금대기", "등록대기"].includes(String(b.status || "")) && (
                                <button
                                  className="compact"
                                  onClick={() => updateOneDayBookingStatus(b.id, "등록완료", "등록 완료")}
                                >
                                  {Number(b.amount_due ?? 10000) === 0 ? "무료 신청 등록 완료" : "입금 확인 / 등록 완료"}
                                </button>
                              )}
                              {["입금완료", "등록완료"].includes(String(b.status || "")) && (
                                <button
                                  className="secondary compact"
                                  onClick={() => updateOneDayBookingStatus(
                                    b.id,
                                    Number(b.amount_due ?? 10000) === 0 ? "등록대기" : "입금대기",
                                    Number(b.amount_due ?? 10000) === 0 ? "무료 등록 대기" : "입금 대기",
                                  )}
                                >
                                  {Number(b.amount_due ?? 10000) === 0 ? "무료 등록 대기로 되돌리기" : "입금 대기로 되돌리기"}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </>
      )}
      <style jsx>{`
        .todayCard {
          border-color: #d8c2a4;
          background: linear-gradient(180deg, #fffdf8 0%, #fff8ee 100%);
        }
        .sectionHeaderRow {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }
        .eyebrow {
          margin: 0 0 4px;
          font-size: 13px;
          font-weight: 800;
          color: #8a5a2f;
          letter-spacing: 0.02em;
        }
        .scheduleLink {
          flex-shrink: 0;
          padding: 10px 14px;
          border-radius: 999px;
          background: #7d5a36;
          color: white;
          text-decoration: none;
          font-size: 14px;
          font-weight: 700;
        }
        .todaySummaryGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 18px;
        }
        .todaySummaryBox {
          padding: 14px;
          border: 1px solid #eadfce;
          border-radius: 16px;
          background: white;
        }
        .todaySummaryBox span {
          display: block;
          margin-bottom: 6px;
          color: #766a5d;
          font-size: 13px;
        }
        .todaySummaryBox strong {
          font-size: 22px;
        }
        .todayTimeline {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .todayItem {
          display: grid;
          grid-template-columns: 86px 1fr;
          gap: 14px;
          padding: 14px;
          border: 1px solid #eadfce;
          border-radius: 18px;
          background: #fffefa;
        }
        .todayItem.regular { border-left: 6px solid #7e9bc8; }
        .todayItem.block { border-left: 6px solid #9a958c; }
        .todayItem.oneday { border-left: 6px solid #b58ac8; }
        .todayTime {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 4px;
          color: #4e4034;
        }
        .todayTime strong { font-size: 18px; }
        .todayTime span { font-size: 13px; color: #7a7168; }
        .todayContent {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
        }
        .todayContent strong { font-size: 16px; }
        .todayContent p { margin: 0; color: #6f655c; line-height: 1.45; }
        .todayBadge {
          width: fit-content;
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          background: #f2eadf;
          color: #5d4b3b;
        }
        .todayBadge.regular { background: #eaf0fb; color: #3d5c8b; }
        .todayBadge.block { background: #eeeeec; color: #5e5a54; }
        .todayBadge.oneday { background: #f4eafa; color: #7b4a91; }
        .todayMemo {
          padding-top: 4px;
          font-size: 13px;
        }
        .emptyToday {
          padding: 18px;
          border: 1px dashed #d9c8b1;
          border-radius: 16px;
          background: white;
        }
        .emptyToday p { margin: 6px 0 0; color: #746a60; }
        @media (max-width: 640px) {
          .sectionHeaderRow { flex-direction: column; }
          .scheduleLink { width: 100%; text-align: center; }
          .todaySummaryGrid { grid-template-columns: 1fr; }
          .todayItem { grid-template-columns: 1fr; }
          .todayTime { flex-direction: row; align-items: baseline; }
        }
        .adminQuickGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
          margin-top: 16px;
        }
        .quickCard {
          width: 100%;
          min-height: 92px;
          padding: 16px;
          border: 1px solid #e6ded3;
          border-radius: 18px;
          background: #fffdf9;
          color: inherit;
          text-align: left;
          text-decoration: none;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 8px;
          font: inherit;
        }
        .quickCard:hover {
          border-color: #c7a77a;
          background: #fff8ee;
        }
        .quickCard strong {
          font-size: 16px;
        }
        .quickCard span {
          font-size: 13px;
          color: #746a60;
          line-height: 1.45;
        }
        .compactMenuCard .row {
          margin-top: 12px;
        }
        .activeSoft {
          border-color: #7d5a36 !important;
          background: #7d5a36 !important;
          color: white !important;
        }
      `}</style>
    </main>
  );
}
