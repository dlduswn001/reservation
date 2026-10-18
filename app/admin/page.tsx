"use client";

import { useEffect, useMemo, useState } from "react";
import { House, CalendarDays, UsersRound, Settings2, ChevronLeft, ChevronRight, NotebookPen, Send, Copy, Search, UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { getRegularPassPolicyStatus, PASS_POLICY_START_DATE_KEY, todayDateKeyInKst } from "../../lib/passPolicy";

type Student = {
  id: string;
  name: string;
  phone_last4: string;
  is_active: boolean;
  memo?: string;
  lesson_credits?: number;
  lesson_duration_minutes?: number;
  pass_registered_at?: string | null;
  pass_first_lesson_at?: string | null;
  pass_expires_at?: string | null;
  pass_extension_used?: boolean | null;
  pass_extension_until?: string | null;
  pass_extension_reason?: string | null;
};

type StudentEdit = {
  name: string;
  phone_last4: string;
  memo: string;
  lesson_credits: string;
  lesson_duration_minutes: string;
  pass_registered_at: string;
  pass_first_lesson_at: string;
  pass_extension_used: boolean;
  pass_extension_until: string;
  pass_extension_reason: string;
  is_active: boolean;
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

type LessonJournal = {
  id: string;
  student_id: string;
  booking_id?: string | null;
  lesson_date: string;
  title: string;
  lesson_summary: string;
  feedback: string;
  homework: string;
  private_note: string;
  created_at?: string;
  updated_at?: string;
};

type JournalDraft = {
  id: string;
  booking_id: string;
  lesson_date: string;
  title: string;
  lesson_summary: string;
  feedback: string;
  homework: string;
  private_note: string;
};

const EMPTY_JOURNAL: JournalDraft = {
  id: "", booking_id: "", lesson_date: "", title: "",
  lesson_summary: "", feedback: "", homework: "", private_note: "",
};

function journalKakaoMessage(studentName: string, journal: JournalDraft | LessonJournal) {
  const lines = [
    "[문장학교 수업일지]",
    `${studentName} 수강생님, 안녕하세요. 문장학교 연주쌤입니다. :)`,
    "",
    `📅 수업일: ${journal.lesson_date}`,
    `✍🏻 수업 주제: ${journal.title}`,
    "",
    "■ 오늘의 수업",
    journal.lesson_summary || "-",
  ];
  if (journal.feedback?.trim()) lines.push("", "■ 오늘의 피드백", journal.feedback.trim());
  if (journal.homework?.trim()) lines.push("", "■ 다음 수업까지", journal.homework.trim());
  lines.push("", "오늘도 함께 읽고 쓰느라 수고 많으셨습니다. 다음 수업에서 만나요! :)", "문장학교 연주쌤");
  return lines.join("\n");
}

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
  is_deleted?: boolean | null;
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
  student_id?: string | null;
  booking_id?: string | null;
};

type DailyScheduleGroup = {
  key: string;
  label: string;
  items: TodayScheduleItem[];
};

type AdminTab = "dashboard" | "schedule" | "students" | "history" | "timetable" | "slots" | "blocks" | "bookings" | "oneday" | "settings";

const STATUS_LABELS: Record<string, string> = {
  booked: "예약 완료",
  cancelled: "취소 완료",
  late_cancelled: "3시간 이내 취소",
  done: "수업 완료",
  change_request: "변경 요청",
  cancel_request: "취소 요청",
};

const TAB_LABELS: Array<{ id: AdminTab; label: string; Icon: typeof House }> = [
  { id: "dashboard", label: "홈", Icon: House },
  { id: "schedule", label: "일정관리", Icon: CalendarDays },
  { id: "students", label: "수강생관리", Icon: UsersRound },
];

const SCHEDULE_TABS: AdminTab[] = ["schedule", "timetable", "slots", "blocks", "bookings", "oneday"];
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

function defaultPassRegisteredAtForNewStudent() {
  const today = todayDateKeyInKst();
  return today >= PASS_POLICY_START_DATE_KEY ? today : "";
}

function passPolicySummary(student: Student) {
  const status = getRegularPassPolicyStatus(student);
  if (!status.firstLessonAt) return "첫 수업일로부터 10주 이내";
  if (!status.applies) return "기존 수강권 · 별도 적용";
  const leftText = typeof status.daysLeft === "number"
    ? status.daysLeft < 0 ? `${Math.abs(status.daysLeft)}일 지남` : `${status.daysLeft}일 남음`
    : "";
  return `${status.label} · ${status.expiresAt || "-"}${leftText ? ` · ${leftText}` : ""}`;
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
  "대기": "대기 신청",
};

const ACTIVE_ONEDAY_STATUSES = new Set(["booked", "입금대기", "등록대기", "입금완료", "등록완료", "대기"]);

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
  // DateTimeFormat.format() can vary by runtime locale. Build stable YYYY-MM-DD.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function todaySeoulDateKey() {
  return seoulDateKey(new Date().toISOString());
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

function dateKeyToDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDaysToDateKey(value: string, days: number) {
  const date = dateKeyToDate(value);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function thisWeekSeoulRangeKeys() {
  const todayKey = todaySeoulDateKey();
  const todayDate = dateKeyToDate(todayKey);
  const day = todayDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const startKey = addDaysToDateKey(todayKey, mondayOffset);
  const endKey = addDaysToDateKey(startKey, 6);
  return { startKey, endKey };
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
  const [restoringAdmin, setRestoringAdmin] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [homeSelectedDate, setHomeSelectedDate] = useState(todaySeoulDateKey);
  const [homeCalendarMonth, setHomeCalendarMonth] = useState(() => {
    const [year,month] = todaySeoulDateKey().split("-").map(Number);
    return { year, month };
  });
  const [studentName, setStudentName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [lessonCredits, setLessonCredits] = useState("4");
  const [lessonDurationMinutes, setLessonDurationMinutes] = useState("90");
  const [passRegisteredAt, setPassRegisteredAt] = useState(defaultPassRegisteredAtForNewStudent);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [adjustedStartAt, setAdjustedStartAt] = useState("");
  const [adjustedLessonMinutes, setAdjustedLessonMinutes] = useState("90");
  const [generateStartDate, setGenerateStartDate] = useState("");
  const [openMondayTuesdayDate, setOpenMondayTuesdayDate] = useState("");
  const [generateWeeks, setGenerateWeeks] = useState("8");
  const [creditEdits, setCreditEdits] = useState<Record<string, string>>({});
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [enrollmentFilter, setEnrollmentFilter] = useState<"active" | "inactive">("active");
  const [enrollmentSaving, setEnrollmentSaving] = useState(false);
  const [showNewStudentForm, setShowNewStudentForm] = useState(false);
  const [showScheduleAdvanced, setShowScheduleAdvanced] = useState(false);
  const [monthToOpen, setMonthToOpen] = useState(() => todaySeoulDateKey().slice(0,7));
  const [monthlyOpening, setMonthlyOpening] = useState(false);
  const [journals, setJournals] = useState<LessonJournal[]>([]);
  const [journalDraft, setJournalDraft] = useState<JournalDraft>({...EMPTY_JOURNAL});
  const [journalsLoading, setJournalsLoading] = useState(false);
  const [journalSaving, setJournalSaving] = useState(false);
  const [journalFeedback, setJournalFeedback] = useState("");
  const [journalPreviewId, setJournalPreviewId] = useState("");

  const [studentEdits, setStudentEdits] = useState<Record<string, StudentEdit>>({});
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
  const [onedayCapacity, setOnedayCapacity] = useState("6");
  const [editingOneDayClassId, setEditingOneDayClassId] = useState<string | null>(null);
  const [oneDayClassEdits, setOneDayClassEdits] = useState<Record<string, {
    title: string;
    curriculum: string;
    start_at: string;
    end_at: string;
    capacity: string;
    regular_price: string;
    normal_price: string;
    is_open: boolean;
  }>>({});
  const [blockedTitle, setBlockedTitle] = useState("체험수업");
  const [blockedStartAt, setBlockedStartAt] = useState("");
  const [blockedEndAt, setBlockedEndAt] = useState("");
  const [blockedMemo, setBlockedMemo] = useState("");
  const [bookingCalendarMonth, setBookingCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [selectedBookingDate, setSelectedBookingDate] = useState<string | null>(null);
  const [adminBookingStudentId, setAdminBookingStudentId] = useState("");
  const [adminBookingStartAt, setAdminBookingStartAt] = useState("");
  const [adminBookingLessonMinutes, setAdminBookingLessonMinutes] = useState("120");
  const [adminBookingMemo, setAdminBookingMemo] = useState("");
  const [adminBookingDeductCredit, setAdminBookingDeductCredit] = useState(true);
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

  // Remain signed in while navigating between administrator sections in
  // the current browser tab, without storing credentials permanently.
  useEffect(() => {
    let remembered = "";
    try { remembered = window.sessionStorage.getItem("munjang_admin_session_password") || ""; } catch {}
    if (remembered) {
      setPassword(remembered);
      void loadOverview(remembered).finally(() => setRestoringAdmin(false));
    } else {
      setRestoringAdmin(false);
    }
  }, []);

  const oneDayClassScheduleGroups = useMemo(() => {
    const todayKeyForClass = todaySeoulDateKey();
    const { endKey: thisWeekEndKey } = thisWeekSeoulRangeKeys();
    const classes = [...(overview?.classes || [])].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    const thisWeek = classes.filter((klass) => {
      const key = seoulDateKey(klass.start_at);
      return key >= todayKeyForClass && key <= thisWeekEndKey;
    });
    const upcoming = classes.filter((klass) => seoulDateKey(klass.start_at) > thisWeekEndKey);
    const past = classes
      .filter((klass) => seoulDateKey(klass.start_at) < todayKeyForClass)
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());

    return [
      {
        id: "this-week",
        title: "이번 주 진행될 원데이 클래스",
        description: "오늘부터 이번 주 일요일까지 진행되는 원데이 클래스입니다.",
        emptyText: "이번 주에 진행될 원데이 클래스가 없습니다.",
        classes: thisWeek,
      },
      {
        id: "upcoming",
        title: "다가오는 원데이 클래스",
        description: "이번 주 이후에 예정된 원데이 클래스입니다.",
        emptyText: "이번 주 이후 예정된 원데이 클래스가 없습니다.",
        classes: upcoming,
      },
      {
        id: "past",
        title: "지난 원데이 클래스",
        description: "이미 종료된 원데이 클래스입니다. 신청자 기록 확인과 수정이 필요할 때만 열어보면 됩니다.",
        emptyText: "지난 원데이 클래스가 없습니다.",
        classes: past,
      },
    ];
  }, [overview?.classes]);

  async function loadOverview(credential = password) {
    setMessage("");
    const res = await fetch("/api/admin/overview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: credential }),
    });
    const json = await res.json();
    if (!res.ok) {
      try { window.sessionStorage.removeItem("munjang_admin_session_password"); } catch {}
      setMessage(json.message || "관리자 페이지에 들어갈 수 없습니다.");
      return;
    }
    setPassword(credential);
    setOverview(json);
    // Reuse admin credentials only in this browser tab, never in a URL.
    try { window.sessionStorage.setItem("munjang_admin_session_password", credential); } catch {}
    // Opening the admin page starts with this month's calendar and today's date.
    // On subsequent refreshes, keep the administrator's currently selected day.
    if (!overview) {
      const key = todaySeoulDateKey();
      const [year,month] = key.split("-").map(Number);
      setHomeCalendarMonth({year,month});
      setHomeSelectedDate(key);
    }
    const routeTab = new URLSearchParams(window.location.search).get("tab");
    setActiveTab((!overview && routeTab === "students") ? "students" : "dashboard");
    const nextEdits: Record<string, string> = {};
    const nextStudentEdits: Record<string, StudentEdit> = {};
    for (const student of json.students || []) {
      nextEdits[student.id] = String(student.lesson_credits ?? 0);
      nextStudentEdits[student.id] = {
        name: student.name || "",
        phone_last4: student.phone_last4 || "",
        memo: student.memo || "",
        lesson_credits: String(student.lesson_credits ?? 0),
        lesson_duration_minutes: String(student.lesson_duration_minutes ?? 90),
        pass_registered_at: student.pass_registered_at || "",
        pass_first_lesson_at: student.pass_first_lesson_at || "",
        pass_extension_used: Boolean(student.pass_extension_used),
        pass_extension_until: student.pass_extension_until || "",
        pass_extension_reason: student.pass_extension_reason || "",
        is_active: student.is_active !== false,
      };
    }
    setCreditEdits(nextEdits);
    setStudentEdits(nextStudentEdits);
    if (!selectedHistoryStudentId && (json.students || []).length > 0) {
      setSelectedHistoryStudentId(json.students[0].id);
    }

    // The management calendar must not jump to the earliest booking from a
    // previous month when the administrator logs in.
    if (!overview) {
      const today = todaySeoulDateKey();
      const [year, month] = today.split("-").map(Number);
      setSelectedBookingDate(today);
      setBookingCalendarMonth({ year, month });
    }
  }

  const alphabeticalStudents = useMemo(
    () => [...(overview?.students || [])].sort((a,b) =>
      a.name.localeCompare(b.name,"ko") || a.phone_last4.localeCompare(b.phone_last4)),
    [overview?.students],
  );

  const activeStudentCount = alphabeticalStudents.filter((student) => student.is_active !== false).length;
  const inactiveStudentCount = alphabeticalStudents.filter((student) => student.is_active === false).length;
  const visibleStudents = useMemo(() => {
    const keyword = studentSearch.trim().toLocaleLowerCase("ko");
    const inSelectedGroup = alphabeticalStudents.filter((student) =>
      enrollmentFilter === "active" ? student.is_active !== false : student.is_active === false);
    if (!keyword) return inSelectedGroup;
    return inSelectedGroup.filter((student) =>
      student.name.toLocaleLowerCase("ko").includes(keyword) || student.phone_last4.includes(keyword));
  }, [alphabeticalStudents, studentSearch, enrollmentFilter]);

  const selectedStudent = alphabeticalStudents.find((student) =>
    student.id === selectedStudentId &&
    (enrollmentFilter === "active" ? student.is_active !== false : student.is_active === false)) || null;
  const selectedStudentBookings = (overview?.bookings || [])
    .filter((booking) => booking.student_id === selectedStudentId &&
      !["cancelled","late_cancelled"].includes(booking.status) &&
      new Date(booking.end_at).getTime() <= Date.now())
    .sort((a,b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());

  function selectStudent(studentId: string) {
    const student = alphabeticalStudents.find((item) => item.id === studentId);
    if (student) setEnrollmentFilter(student.is_active === false ? "inactive" : "active");
    setSelectedStudentId(studentId);
    setEditingStudentId(null);
    setJournalDraft({ ...EMPTY_JOURNAL, lesson_date: todaySeoulDateKey() });
    setJournalPreviewId("");
    setJournalFeedback("");
    setActiveTab("students");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function switchEnrollmentFilter(nextFilter: "active" | "inactive") {
    if (nextFilter === enrollmentFilter) return;
    setEnrollmentFilter(nextFilter);
    setSelectedStudentId("");
    setStudentSearch("");
    setEditingStudentId(null);
    setJournalFeedback("");
    setJournalDraft({ ...EMPTY_JOURNAL });
  }

  async function updateEnrollmentStatus(student: Student, nextActive: boolean) {
    const actionLabel = nextActive ? "재원생으로 전환" : "퇴원 처리";
    const detail = nextActive
      ? "다시 예약 앱을 이용할 수 있습니다."
      : "예약 앱 사용이 중단되지만 수강권·수업 기록·수업일지는 보관됩니다.";
    if (!window.confirm(`${student.name} 수강생을 ${actionLabel}할까요?\n${detail}`)) return;
    setEnrollmentSaving(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          name: student.name,
          phone_last4: student.phone_last4,
          lesson_credits: Number(student.lesson_credits ?? 0),
          lesson_duration_minutes: Number(student.lesson_duration_minutes ?? 90),
          is_active: nextActive,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "재원 상태를 변경하지 못했습니다.");
      await loadOverview();
      setEnrollmentFilter(nextActive ? "active" : "inactive");
      setSelectedStudentId(student.id);
      setEditingStudentId(null);
      setActiveTab("students");
      setMessage(`${student.name} 수강생을 ${nextActive ? "재원생" : "퇴원생"}으로 변경했습니다. 기존 기록은 유지됩니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "재원 상태를 변경하지 못했습니다.");
    } finally {
      setEnrollmentSaving(false);
    }
  }

  useEffect(() => {
    if (!overview || !selectedStudentId) {
      setJournals([]);
      setJournalsLoading(false);
      return;
    }
    let cancelled = false;
    setJournalsLoading(true);
    setJournalFeedback("");
    void (async () => {
      try {
        const res = await fetch("/api/admin/journals", {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({password,action:"list",student_id:selectedStudentId}),
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || "수업일지를 불러오지 못했습니다.");
        if (!cancelled) setJournals(json.journals || []);
      } catch (error) {
        if (!cancelled) setJournalFeedback(error instanceof Error ? error.message : "수업일지를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setJournalsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [overview, selectedStudentId, password]);

  async function refreshStudentJournals(studentId: string) {
    const res = await fetch("/api/admin/journals", {
      method: "POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({password,action:"list",student_id:studentId}),cache:"no-store",
    });
    const json = await res.json();
    if(!res.ok) throw new Error(json.message || "수업일지를 다시 불러오지 못했습니다.");
    setJournals(json.journals || []);
  }

  function selectJournalBooking(bookingId: string) {
    const existing = bookingId ? journals.find((journal) => journal.booking_id === bookingId) : null;
    if (existing) {
      editJournal(existing);
      setJournalFeedback("이 수업의 일지를 불러왔습니다. 내용을 수정해 주세요.");
      return;
    }
    const booking = selectedStudentBookings.find((row) => row.id === bookingId);
    setJournalDraft((current) => ({
      ...current,
      booking_id:bookingId,
      ...(booking ? {
        lesson_date:seoulDateKey(booking.start_at),
        title:booking.memo?.includes("필사생활") ? "1:1 필사생활"
          :booking.memo?.includes("서평생활") ? "1:1 서평생활" : "1:1 정규수업",
      } : {}),
    }));
  }

  async function saveJournal() {
    if (!selectedStudent) return;
    setJournalSaving(true);
    setJournalFeedback("");
    try {
      const res = await fetch("/api/admin/journals", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          password,action:"save",student_id:selectedStudent.id,...journalDraft,
        }),
      });
      const json = await res.json();
      if(!res.ok) throw new Error(json.message || "수업일지를 저장하지 못했습니다.");
      setJournalPreviewId(json.journal?.id || "");
      setJournalDraft({...EMPTY_JOURNAL, lesson_date:todaySeoulDateKey()});
      await refreshStudentJournals(selectedStudent.id);
      setJournalFeedback("수업일지를 저장했습니다. 아래에서 내용을 확인하고 카카오톡으로 공유해 주세요.");
    } catch(error) {
      setJournalFeedback(error instanceof Error ? error.message : "수업일지를 저장하지 못했습니다.");
    } finally {
      setJournalSaving(false);
    }
  }

  function editJournal(journal: LessonJournal) {
    setJournalDraft({
      id: journal.id,
      booking_id:journal.booking_id || "",
      lesson_date:journal.lesson_date,
      title:journal.title,
      lesson_summary:journal.lesson_summary,
      feedback:journal.feedback,
      homework:journal.homework,
      private_note:journal.private_note,
    });
    setJournalFeedback("");
    document.getElementById("journal-editor")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function deleteJournal(journal: LessonJournal) {
    if(!selectedStudent || !window.confirm(`${journal.lesson_date} 수업일지를 삭제할까요?`))return;
    try{
      const res=await fetch("/api/admin/journals",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({password,action:"delete",id:journal.id,student_id:selectedStudent.id}),
      });
      const json=await res.json();
      if(!res.ok)throw new Error(json.message||"수업일지를 삭제하지 못했습니다.");
      if(journalDraft.id===journal.id)setJournalDraft({...EMPTY_JOURNAL,lesson_date:todaySeoulDateKey()});
      setJournalFeedback("수업일지를 삭제했습니다.");
      await refreshStudentJournals(selectedStudent.id);
    }catch(error){
      setJournalFeedback(error instanceof Error ? error.message : "수업일지를 삭제하지 못했습니다.");
    }
  }

  async function copyJournalMessage(journal: LessonJournal) {
    if(!selectedStudent)return;
    try {
      await navigator.clipboard.writeText(journalKakaoMessage(selectedStudent.name,journal));
      setJournalFeedback("카카오톡 안내문을 복사했습니다. 수강생 대화방에 붙여넣어 주세요.");
    } catch {
      setJournalFeedback("복사 기능을 사용할 수 없습니다. 아래 미리보기에서 메시지를 직접 선택해 복사해 주세요.");
    }
    setJournalPreviewId(journal.id);
  }

  async function shareJournalMessage(journal: LessonJournal) {
    if(!selectedStudent)return;
    setJournalPreviewId(journal.id);
    const content=journalKakaoMessage(selectedStudent.name,journal);
    if(typeof navigator.share === "function"){
      try {
        await navigator.share({title:`문장학교 ${selectedStudent.name} 수업일지`,text:content});
        // The OS share sheet does not tell us which recipient or app received it.
        setJournalFeedback("휴대폰 공유 화면을 열었습니다. 카카오톡에서 수강생과 발송 여부를 직접 확인해 주세요.");
      } catch(error){
        if(error instanceof Error && error.name==="AbortError")return;
        setJournalFeedback("공유에 실패했습니다. 복사 버튼으로 내용을 복사해 카카오톡에 붙여넣어 주세요.");
      }
    } else {
      await copyJournalMessage(journal);
    }
  }

  async function openMonthlySchedule() {
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthToOpen) || monthToOpen < "2026-10"){
      setMessage("2026년 10월 이후의 수업 월을 선택해 주세요.");return;
    }
    if(!window.confirm(`${monthToOpen} 월간 수업 시간을 열까요? 기존 예약과 닫힌 시간, 월·화 휴무는 변경하지 않습니다.`))return;
    setMonthlyOpening(true);setMessage("");
    try{
      const res=await fetch("/api/admin/generate-slots",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({password,open_month:monthToOpen}),
      });
      const json=await res.json();
      if(!res.ok)throw new Error(json.message||"월간 수업 시간을 열지 못했습니다.");
      await loadOverview();
      setActiveTab("timetable");
      setMessage(json.message||"월간 수업을 열었습니다.");
    }catch(error){
      setMessage(error instanceof Error ? error.message : "월간 수업을 열지 못했습니다.");
    }finally{setMonthlyOpening(false);}
  }

  async function addStudent() {
    setMessage("");
    const res = await fetch("/api/admin/students", {
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        password,name:studentName,phone_last4:phoneLast4,
        lesson_credits:Number(lessonCredits||0),
        lesson_duration_minutes:Number(lessonDurationMinutes||90),
        pass_registered_at:passRegisteredAt,
      }),
    });
    const json=await res.json();
    if(!res.ok){setMessage(json.message||"수강생을 등록하지 못했습니다.");return;}
    setStudentName("");setPhoneLast4("");setLessonCredits("4");
    setLessonDurationMinutes("90");setPassRegisteredAt(defaultPassRegisteredAtForNewStudent());
    setShowNewStudentForm(false);
    await loadOverview();
    setActiveTab("students");
    setMessage("수강생을 등록했습니다. 이름을 선택해 정보를 확인해 주세요.");
  }

  async function updateStudent(studentId: string) {
    const edit=studentEdits[studentId];if(!edit)return;
    setMessage("");
    const res=await fetch(`/api/admin/students/${studentId}`,{
      method:"PATCH",headers:{"Content-Type":"application/json"},
      // First-lesson, existing extensions and private memo are intentionally
      // omitted: the backend preserves them. The first booked lesson sets
      // validity automatically, not the administrator's edit form.
      body:JSON.stringify({
        password,name:edit.name,phone_last4:edit.phone_last4,
        lesson_credits:Number(edit.lesson_credits||0),
        lesson_duration_minutes:Number(edit.lesson_duration_minutes||90),
        pass_registered_at:edit.pass_registered_at,
        is_active:edit.is_active,
      }),
    });
    const json=await res.json();
    if(!res.ok){setMessage(json.message||"수강생 정보를 수정하지 못했습니다.");return;}
    setEditingStudentId(null);
    await loadOverview();
    setActiveTab("students");
    setMessage("수강생 정보를 수정했습니다.");
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
        pass_registered_at: student.pass_registered_at || "",
        pass_first_lesson_at: student.pass_first_lesson_at || "",
        pass_extension_used: Boolean(student.pass_extension_used),
        pass_extension_until: student.pass_extension_until || "",
        pass_extension_reason: student.pass_extension_reason || "",
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

  async function createAdminRegularBooking() {
    setMessage("");
    const res = await fetch("/api/admin/regular-bookings/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        student_id: adminBookingStudentId,
        start_at: adminBookingStartAt,
        lesson_minutes: Number(adminBookingLessonMinutes || 120),
        memo: adminBookingMemo,
        deduct_credit: adminBookingDeductCredit,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "관리자 예약을 등록할 수 없습니다.");
      return;
    }
    setAdminBookingStudentId("");
    setAdminBookingStartAt("");
    setAdminBookingLessonMinutes("120");
    setAdminBookingMemo("");
    setAdminBookingDeductCredit(true);
    setMessage(json.message || "관리자 예약을 등록했습니다.");
    await loadOverview();
    setActiveTab("bookings");
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
    const minutes = Number(adjustedLessonMinutes) === 45 ? 45 : Number(adjustedLessonMinutes) === 120 ? 120 : 90;
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

  function isProtectedOctoberDate(dateKey: string) {
    return ["2026-10-19", "2026-10-20", "2026-10-26", "2026-10-27"].includes(dateKey);
  }

  async function openMondayTuesdaySlots() {
    if (isProtectedOctoberDate(openMondayTuesdayDate)) {
      setMessage("10월 19·20·26·27일은 보호 일정입니다. 기존 개방 상태와 예약을 유지합니다.");
      return;
    }
    if (!openMondayTuesdayDate) {
      setMessage("수업을 열 월요일 또는 화요일 날짜를 선택해 주세요.");
      return;
    }
    const selectedDay = new Date(`${openMondayTuesdayDate}T12:00:00Z`).getUTCDay();
    if (![1, 2].includes(selectedDay)) {
      setMessage("월요일 또는 화요일 날짜만 선택할 수 있습니다.");
      return;
    }
    if (!window.confirm(`${openMondayTuesdayDate}의 수업 시간을 수요일과 동일하게 열까요? 기존 예약은 변경되지 않습니다.`)) return;

    setMessage("");
    try {
      const res = await fetch("/api/admin/generate-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, open_weekday_date: openMondayTuesdayDate }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.message || "월·화요일 시간표를 열 수 없습니다.");
        return;
      }
      setMessage(json.message || "월·화요일 시간표를 열었습니다.");
      await loadOverview();
      setActiveTab("slots");
    } catch {
      setMessage("수업 시간 등록 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  }

  async function closeMondayTuesdaySlots() {
    if (isProtectedOctoberDate(openMondayTuesdayDate)) {
      setMessage("10월 19·20·26·27일은 보호 일정입니다. 기존 개방 상태와 예약을 유지합니다.");
      return;
    }
    if (!openMondayTuesdayDate || ![1, 2].includes(new Date(openMondayTuesdayDate + "T12:00:00Z").getUTCDay())) {
      setMessage("월요일 또는 화요일 날짜를 선택해 주세요.");
      return;
    }
    if (!window.confirm(openMondayTuesdayDate + "의 신규 예약을 닫을까요? 기존 예약은 유지됩니다.")) return;
    const res = await fetch("/api/admin/generate-slots", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, close_weekday_date: openMondayTuesdayDate }),
    });
    const json = await res.json();
    setMessage(json.message || "처리 결과를 확인해 주세요.");
    if (res.ok) await loadOverview();
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

  async function reassignOctoberBookings() {
    const ok = window.confirm("10월에 미리 예약된 정규수업을 가장 가까운 10월 정규수업 시간대로 정리할까요? 이미 정규시간에 맞는 예약은 그대로 둡니다.");
    if (!ok) return;
    setMessage("10월 기존 예약을 정규수업 시간대로 정리하는 중입니다...");
    const res = await fetch("/api/admin/reassign-october-bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "10월 기존 예약을 정리할 수 없습니다.");
      return;
    }
    setMessage(`10월 기존 예약 정리 완료: 이동 ${json.moved || 0}건 / 유지 ${json.kept || 0}건 / 확인 필요 ${json.skipped || 0}건`);
    await loadOverview();
    setActiveTab("bookings");
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
        capacity: 6,
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
    setOnedayCapacity("5");
    setMessage("원데이 클래스를 등록했습니다.");
    await loadOverview();
    setActiveTab("oneday");
  }

  function startEditOneDayClass(oneClass: OneDayClass) {
    setEditingOneDayClassId(oneClass.id);
    setOneDayClassEdits((current) => ({
      ...current,
      [oneClass.id]: {
        title: oneClass.title || "",
        curriculum: oneClass.description || "",
        start_at: toSeoulDateTimeInput(oneClass.start_at),
        end_at: toSeoulDateTimeInput(oneClass.end_at),
        capacity: String(oneClass.capacity || 5),
        regular_price: String(oneClass.regular_price ?? 10000),
        normal_price: String(oneClass.normal_price ?? 30000),
        is_open: oneClass.is_open !== false,
      },
    }));
  }

  function cancelEditOneDayClass(classId: string) {
    setEditingOneDayClassId(null);
    setOneDayClassEdits((current) => {
      const next = { ...current };
      delete next[classId];
      return next;
    });
  }

  function updateOneDayClassEdit(
    classId: string,
    field: "title" | "curriculum" | "start_at" | "end_at" | "capacity" | "regular_price" | "normal_price" | "is_open",
    value: string | boolean
  ) {
    setOneDayClassEdits((current) => ({
      ...current,
      [classId]: {
        ...(current[classId] || {
          title: "",
          curriculum: "",
          start_at: "",
          end_at: "",
          capacity: "5",
          regular_price: "10000",
          normal_price: "30000",
          is_open: true,
        }),
        [field]: value,
      },
    }));
  }

  async function saveOneDayClass(classId: string) {
    const edit = oneDayClassEdits[classId];
    if (!edit) {
      setMessage("수정할 원데이 클래스 정보를 찾을 수 없습니다.");
      return;
    }

    setMessage("");
    const res = await fetch(`/api/admin/oneday/${classId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        title: edit.title,
        curriculum: edit.curriculum,
        start_at: edit.start_at,
        end_at: edit.end_at,
        capacity: 6,
        regular_price: Number(edit.regular_price || 0),
        normal_price: Number(edit.normal_price || 0),
        is_open: edit.is_open,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "원데이 클래스를 수정할 수 없습니다.");
      return;
    }

    setMessage("원데이 클래스를 수정했습니다.");
    cancelEditOneDayClass(classId);
    await loadOverview();
    setActiveTab("oneday");
  }

  async function deleteOnedayClass(classId: string, title: string) {
    const ok = window.confirm(`${title} 원데이 클래스를 삭제할까요? 삭제 후에는 수강생 예약 화면과 관리자 원데이 클래스 목록에서 사라집니다. 기존 신청자 기록은 보존됩니다.`);
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
    setMessage("원데이 클래스를 삭제했습니다. 기존 신청자 기록은 보존됩니다.");
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
      // 단, 3시간 이내 취소로 수강권이 차감된 late_cancelled 기록은 확인할 수 있게 유지합니다.
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

  const zeroCreditStudents = useMemo(() => {
    return [...(overview?.students || [])]
      .filter((student) => student.is_active !== false && Number(student.lesson_credits ?? 0) <= 0)
      .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [overview?.students]);

  const passAlertStudents = useMemo(() => {
    return [...(overview?.students || [])]
      .map((student) => ({ student, status: getRegularPassPolicyStatus(student) }))
      .filter(({ student, status }) => student.is_active !== false && status.applies && Boolean(status.firstLessonAt) && (status.expired || status.expiringSoon))
      .sort((a, b) => {
        const aDays = typeof a.status.daysLeft === "number" ? a.status.daysLeft : 9999;
        const bDays = typeof b.status.daysLeft === "number" ? b.status.daysLeft : 9999;
        return aDays - bDays;
      });
  }, [overview?.students]);

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

  const dailyScheduleGroups = useMemo<DailyScheduleGroup[]>(() => {
    if (!overview) return [];

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 31);
    const endKey = seoulDateKey(endDate.toISOString());
    const items: TodayScheduleItem[] = [];

    for (const booking of overview.bookings || []) {
      if (booking.status === "cancelled" || booking.status === "late_cancelled") continue;
      const key = seoulDateKey(booking.start_at);
      if (key < todayKey || key > endKey) continue;

      items.push({
        id: `daily-regular-${booking.id}`,
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
      const key = seoulDateKey(block.start_at);
      if (key < todayKey || key > endKey) continue;

      items.push({
        id: `daily-block-${block.id}`,
        type: "block",
        start_at: block.start_at,
        end_at: block.end_at,
        label: "외부/체험",
        title: block.title || "외부 차단",
        subtitle: block.memo || "관리자가 차단한 일정입니다.",
      });
    }

    for (const klass of overview.classes || []) {
      const key = seoulDateKey(klass.start_at);
      if (key < todayKey || key > endKey) continue;

      const relatedBookings = (overview.onedayBookings || []).filter((booking) => {
        const classId = booking.class_id || booking.oneday_classes?.id;
        return classId === klass.id && isActiveOneDayBooking(booking.status);
      });
      const confirmedCount = relatedBookings.filter((booking) => ["입금완료", "등록완료"].includes(String(booking.status || ""))).length;

      items.push({
        id: `daily-oneday-${klass.id}`,
        type: "oneday",
        start_at: klass.start_at,
        end_at: klass.end_at,
        label: "원데이",
        title: klass.title || "원데이 클래스",
        subtitle: `신청 ${relatedBookings.length}명 / 확정 ${confirmedCount}명 / 정원 ${klass.capacity || 0}명`,
        detail: klass.description || undefined,
      });
    }

    items.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    const grouped = new Map<string, DailyScheduleGroup>();
    for (const item of items) {
      const key = seoulDateKey(item.start_at);
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          label: `${key === todayKey ? "오늘 · " : ""}${formatDateOnly(item.start_at)}`,
          items: [],
        });
      }
      grouped.get(key)!.items.push(item);
    }

    return Array.from(grouped.values());
  }, [overview, todayKey]);

  // A month-wide view of actual lessons. Available-but-unbooked slots are not
  // lessons and intentionally have no calendar marker.
  // Directly entered lessons are in regular_bookings; manual outside/experience
  // schedules are in blocked_times, and one-day lessons in oneday_classes.
  const homeItemsByDay = useMemo<Record<string, TodayScheduleItem[]>>(() => {
    const grouped: Record<string, TodayScheduleItem[]> = {};
    if (!overview) return grouped;

    const add = (item: TodayScheduleItem) => {
      const dateKey = seoulDateKey(item.start_at);
      (grouped[dateKey] ||= []).push(item);
    };

    for (const booking of overview.bookings || []) {
      if (["cancelled", "late_cancelled"].includes(booking.status)) continue;
      add({
        id: `calendar-regular-${booking.id}`,
        student_id: booking.student_id,
        booking_id: booking.id,
        type: "regular",
        start_at: booking.start_at,
        end_at: booking.end_at,
        label: "정규수업",
        title: booking.students?.name || "수강생 이름 없음",
        subtitle: STATUS_LABELS[booking.status] || booking.status,
        detail: booking.memo || undefined,
      });
    }
    for (const block of overview.blockedTimes || []) {
      add({
        id: `calendar-block-${block.id}`,
        type: "block",
        start_at: block.start_at,
        end_at: block.end_at,
        label: "관리자 일정",
        title: block.title || "외부 일정 / 체험수업",
        subtitle: block.memo || "관리자가 직접 등록한 일정",
      });
    }
    for (const klass of overview.classes || []) {
      const applications = (overview.onedayBookings || []).filter(
        (booking) => (booking.class_id || booking.oneday_classes?.id) === klass.id
          && isActiveOneDayBooking(booking.status),
      );
      add({
        id: `calendar-oneday-${klass.id}`,
        type: "oneday",
        start_at: klass.start_at,
        end_at: klass.end_at,
        label: "원데이",
        title: klass.title || "원데이 클래스",
        subtitle: `신청 ${applications.length}건 · 정원 ${klass.capacity || 0}명`,
        detail: klass.description || undefined,
      });
    }

    for (const dateKey of Object.keys(grouped)) {
      grouped[dateKey].sort((a,b) =>
        new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    }
    return grouped;
  }, [overview]);

  const homeCalendarDays = useMemo(
    () => buildCalendarDays(homeCalendarMonth.year, homeCalendarMonth.month),
    [homeCalendarMonth],
  );
  const homeMonthKey = `${homeCalendarMonth.year}-${String(homeCalendarMonth.month).padStart(2,"0")}`;
  const homeMonthlyCount = Object.entries(homeItemsByDay)
    .filter(([day]) => day.startsWith(homeMonthKey))
    .reduce((total, [,items]) => total + items.length, 0);
  const homeSelectedItems = homeItemsByDay[homeSelectedDate] || [];

  function moveHomeMonth(direction: -1 | 1) {
    const target = new Date(Date.UTC(homeCalendarMonth.year, homeCalendarMonth.month - 1 + direction, 1));
    const year = target.getUTCFullYear();
    const month = target.getUTCMonth() + 1;
    setHomeCalendarMonth({ year, month });
    const targetKey = `${year}-${String(month).padStart(2,"0")}`;
    const today = todaySeoulDateKey();
    setHomeSelectedDate(today.startsWith(targetKey) ? today : `${targetKey}-01`);
  }
  function goHomeToday() {
    const today = todaySeoulDateKey();
    const [year,month] = today.split("-").map(Number);
    setHomeCalendarMonth({ year,month });
    setHomeSelectedDate(today);
  }

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

  function renderOneDayClassCard(c: OneDayClass) {
    const edit = oneDayClassEdits[c.id];
    const isEditing = editingOneDayClassId === c.id && !!edit;
    const relatedBookings = (overview?.onedayBookings || []).filter((booking) => {
      const classId = booking.class_id || booking.oneday_classes?.id;
      return classId === c.id && isActiveOneDayBooking(booking.status);
    });
    const confirmedCount = relatedBookings.filter((booking) => ["입금완료", "등록완료"].includes(String(booking.status || ""))).length;
    const waitingCount = relatedBookings.filter((booking) => ["booked", "입금대기", "등록대기"].includes(String(booking.status || ""))).length;
    const classIsPast = seoulDateKey(c.start_at) < todaySeoulDateKey();

    return (
      <div className={`item onedayClassCard ${classIsPast ? "pastClass" : ""}`} key={c.id}>
        {isEditing ? (
          <div className="editBox">
            <label>제목</label>
            <input value={edit.title} onChange={(e) => updateOneDayClassEdit(c.id, "title", e.target.value)} />
            <label>커리큘럼</label>
            <textarea rows={5} value={edit.curriculum} onChange={(e) => updateOneDayClassEdit(c.id, "curriculum", e.target.value)} />
            <label>수업 시작 일정</label>
            <input type="datetime-local" value={edit.start_at} onChange={(e) => updateOneDayClassEdit(c.id, "start_at", e.target.value)} />
            <label>수업 종료 일정</label>
            <input type="datetime-local" value={edit.end_at} onChange={(e) => updateOneDayClassEdit(c.id, "end_at", e.target.value)} />
            <p className="small">정원 6명 고정 (동반자 포함)</p>
            <label>정규수강생 추가 참석 비용</label>
            <input type="number" min="0" value={edit.regular_price} onChange={(e) => updateOneDayClassEdit(c.id, "regular_price", e.target.value)} />
            <label>일반 수강 비용</label>
            <input type="number" min="0" value={edit.normal_price} onChange={(e) => updateOneDayClassEdit(c.id, "normal_price", e.target.value)} />
            <label className="checkboxRow">
              <input type="checkbox" checked={edit.is_open} onChange={(e) => updateOneDayClassEdit(c.id, "is_open", e.target.checked)} />
              <span>수강생 원데이 신청 화면에 노출</span>
            </label>
            <div className="inlineActions">
              <button onClick={() => saveOneDayClass(c.id)}>수정 저장</button>
              <button className="secondary" onClick={() => cancelEditOneDayClass(c.id)}>취소</button>
            </div>
          </div>
        ) : (
          <div className="oneDayClassRow">
            <div className="oneDayClassMain">
              <div className="oneDayClassTopline">
                <span className={`todayBadge ${classIsPast ? "block" : "oneday"}`}>{classIsPast ? "지난 수업" : "진행 예정"}</span>
                <strong>{c.title}</strong>
              </div>
              <p className="small">{formatDateOnly(c.start_at)} {formatTime(c.start_at)} - {formatTime(c.end_at)}</p>
              <div className="onedayClassStats">
                <span>신청 {relatedBookings.length}명</span>
                <span>대기 {waitingCount}명</span>
                <span>확정 {confirmedCount}명</span>
                <span>정원 6명</span>
                <span>{c.is_open ? "예약 화면 노출" : "예약 화면 숨김"}</span>
              </div>
              <p className="small">정규수강생 전용 · 신청 즉시 확정 · 정원 초과 시 대기</p>
              {c.description && <p className="onedayCurriculumPreview">커리큘럼: {c.description}</p>}
            </div>
            <div className="inlineActions oneDayClassActions">
              <button className="secondary compact" onClick={() => startEditOneDayClass(c)}>수정</button>
              <button className="danger compact" onClick={() => deleteOnedayClass(c.id, c.title)}>삭제</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="container adminMobilePage">
      <header className="adminMobileHeader">
        <div className="adminBrand">
          <span>문장학교</span>
          <strong>관리자</strong>
        </div>
        <div className="adminHeaderActions">
          <Link href="/" className="adminPublicLink" aria-label="수강생 예약 앱으로 이동">
            수강생 화면
          </Link>
          {overview && (
            <button
              type="button"
              className={`adminSettingsButton ${activeTab === "settings" ? "active" : ""}`}
              aria-label="관리자 설정 열기"
              title="관리자 설정"
              onClick={() => openTab(activeTab === "settings" ? "dashboard" : "settings")}
            >
              <Settings2 size={21} strokeWidth={1.8}/>
            </button>
          )}
        </div>
      </header>

      {!overview && restoringAdmin && (
        <section className="card adminLoginCard"><p className="small">관리자 화면을 불러오는 중입니다...</p></section>
      )}
      {!overview && !restoringAdmin && (
        <section className="card adminLoginCard">
          <p className="adminEyebrow">문장학교 관리자 전용</p>
          <h1>관리자 로그인</h1>
          <p className="small">관리자 비밀번호를 입력하시면 수업 일정과 수강생 정보를 확인할 수 있습니다.</p>
          <label htmlFor="adminPassword">관리자 비밀번호</label>
          <input id="adminPassword" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void loadOverview(); }}
            placeholder="비밀번호" />
          <button className="adminLoginButton" onClick={() => void loadOverview()}>로그인</button>
          {message && <p role="alert" className="error">{message}</p>}
        </section>
      )}

      {overview && (
        <>
          {message && <div className="adminFeedback" role="status">{message}</div>}
          {activeTab === "dashboard" && (
            <>
              <section className="card adminHomeCalendarCard">
                <div className="adminHomeTitle">
                  <div>
                    <p className="adminEyebrow">수업 일정 한눈에 보기</p>
                    <h1>이달의 수업 일정</h1>
                    <p className="small">오늘 날짜를 선택해 두었어요. 날짜를 누르면 직접 등록한 수업까지 확인할 수 있습니다.</p>
                  </div>
                  <button type="button" className="adminTodayButton" onClick={goHomeToday}>오늘</button>
                </div>

                <div className="adminMonthHeader">
                  <button type="button" className="adminMonthArrow" onClick={() => moveHomeMonth(-1)}
                    aria-label="이전 달"><ChevronLeft size={21}/></button>
                  <strong>{homeCalendarMonth.year}년 {homeCalendarMonth.month}월</strong>
                  <button type="button" className="adminMonthArrow" onClick={() => moveHomeMonth(1)}
                    aria-label="다음 달"><ChevronRight size={21}/></button>
                </div>

                <div className="adminMonthWeekdays" aria-hidden="true">
                  <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
                </div>
                <div className="adminMonthGrid" role="group" aria-label="월별 수업 달력">
                  {homeCalendarDays.map((day,index) => {
                    const items = day.key ? homeItemsByDay[day.key] || [] : [];
                    const selected = day.key !== null && homeSelectedDate === day.key;
                    const today = day.key !== null && day.key === todayKey;
                    return day.key ? (
                      <button key={day.key} type="button"
                        className={`adminMonthDay ${selected ? "selected" : ""} ${today ? "today" : ""}`}
                        aria-label={`${day.key} 수업 ${items.length}건`}
                        aria-pressed={selected}
                        onClick={() => setHomeSelectedDate(day.key!)}>
                        <span className="adminMonthNumber">{day.day}</span>
                        <span className="adminMonthDots" aria-hidden="true">
                          {(["regular","oneday","block"] as const).filter(type => items.some(item => item.type === type))
                            .map(type => <i key={type} className={type}/>)}
                        </span>
                      </button>
                    ) : <span key={`empty-${index}`} className="adminMonthEmpty"/>;
                  })}
                </div>

                <div className="adminMonthFoot">
                  <span>이달 등록된 수업·일정 <strong>{homeMonthlyCount}건</strong></span>
                  <div className="adminMonthLegend">
                    <span><i className="regular"/> 정규</span>
                    <span><i className="oneday"/> 원데이</span>
                    <span><i className="block"/> 관리자 일정</span>
                  </div>
                </div>

                <div className="adminSelectedDay">
                  <div className="adminSelectedDayHeader">
                    <div>
                      <p className="adminEyebrow">{homeSelectedDate === todayKey ? "오늘의 일정" : "선택한 날짜"}</p>
                      <h2>{homeSelectedDate.replace(/-/g, ". ")} <small>{homeSelectedItems.length}건</small></h2>
                    </div>
                    <button type="button" className="adminSubtleButton" onClick={() => openTab("schedule")}>
                      일정관리
                    </button>
                  </div>
                  {homeSelectedItems.length === 0 ? (
                    <div className="adminNoLessons">등록된 수업이나 일정이 없습니다.</div>
                  ) : (
                    <div className="adminDailyLessons">
                      {homeSelectedItems.map(item => (
                        <article key={item.id} className={`adminLessonRow ${item.type}`}>
                          <div className="adminLessonTime">
                            <strong>{formatTime(item.start_at)}</strong>
                            <span>{formatTime(item.end_at)}</span>
                          </div>
                          <div className="adminLessonInfo">
                            <span className={`adminLessonBadge ${item.type}`}>{item.label}</span>
                            <strong>{item.title}</strong>
                            <p>{item.subtitle}</p>
                            {item.detail && <p className="adminLessonMemo">{item.detail}</p>}
                            {item.type === "regular" && item.student_id &&
                              new Date(item.end_at).getTime() <= Date.now() && (
                                <button type="button" className="adminInlineJournalButton"
                                  onClick={() => {
                                    selectStudent(item.student_id || "");
                                    setJournalDraft({
                                      ...EMPTY_JOURNAL,
                                      booking_id: item.booking_id || "",
                                      lesson_date: seoulDateKey(item.start_at),
                                      title: item.detail?.includes("필사생활") ? "1:1 필사생활"
                                        : item.detail?.includes("서평생활") ? "1:1 서평생활" : "1:1 정규수업",
                                    });
                                  }}>
                                  <NotebookPen size={14}/> 수업일지 작성
                                </button>
                              )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="card adminCompactAlertCard">
                <div className="adminCompactAlertHeader">
                  <h2>수강권 0회 <span>{zeroCreditStudents.length}명</span></h2>
                  <button className="adminTextLink" onClick={() => openTab("students")}>수강생관리</button>
                </div>
                {zeroCreditStudents.length === 0
                  ? <p className="adminAlertEmpty">해당 수강생이 없습니다.</p>
                  : <div className="adminAlertNames">
                      {zeroCreditStudents.map(student => (
                        <button key={student.id} className="adminAlertName" onClick={() => selectStudent(student.id)}>
                          {student.name}
                        </button>
                      ))}
                    </div>}
              </section>

              <section className="card adminCompactAlertCard">
                <div className="adminCompactAlertHeader">
                  <h2>사용기간 임박·만료 <span>{passAlertStudents.length}명</span></h2>
                  <button className="adminTextLink" onClick={() => openTab("students")}>수강생관리</button>
                </div>
                {passAlertStudents.length === 0
                  ? <p className="adminAlertEmpty">해당 수강생이 없습니다.</p>
                  : <div className="adminAlertNames">
                      {passAlertStudents.map(({student,status}) => (
                        <button key={student.id} className="adminAlertName" onClick={() => selectStudent(student.id)}>
                          {student.name} <small>{typeof status.daysLeft === "number" ? (status.daysLeft<0 ? "만료" : `D-${status.daysLeft}`) : ""}</small>
                        </button>
                      ))}
                    </div>}
              </section>
            </>
          )}

          {activeTab === "schedule" && (
            <section className="card adminScheduleLanding">
              <p className="adminEyebrow">관리자 일정관리</p>
              <h1>일정관리</h1>
              <p className="small">원하는 관리 메뉴를 선택해 주세요.</p>
              <div className="adminSimpleMenu">
                <button type="button" className="adminSimpleMenuItem" onClick={() => openTab("timetable")}>
                  <span className="adminSimpleMenuIcon"><CalendarDays size={23}/></span>
                  <span className="adminSimpleMenuLabel">
                    <strong>월별 수업 열기</strong>
                    <small>월간 시간표와 휴무일 관리</small>
                  </span>
                  <ChevronRight size={19}/>
                </button>
                <button type="button" className="adminSimpleMenuItem" onClick={() => openTab("blocks")}>
                  <span className="adminSimpleMenuIcon"><Settings2 size={23}/></span>
                  <span className="adminSimpleMenuLabel">
                    <strong>외부 차단</strong>
                    <small>체험수업·상담·외부 일정 관리</small>
                  </span>
                  <ChevronRight size={19}/>
                </button>
                <button type="button" className="adminSimpleMenuItem" onClick={() => openTab("oneday")}>
                  <span className="adminSimpleMenuIcon"><NotebookPen size={23}/></span>
                  <span className="adminSimpleMenuLabel">
                    <strong>원데이 클래스</strong>
                    <small>수업 개설·수정·신청자 확인</small>
                  </span>
                  <ChevronRight size={19}/>
                </button>
              </div>
            </section>
          )}

          {activeTab === "students" && (
            <>
              <section className="card adminStudentHub">
                <div className="adminStudentHeading">
                  <div><p className="adminEyebrow">문장학교 수강생</p><h1>수강생관리</h1></div>
                  <button className="adminSmallAction" type="button"
                    onClick={() => setShowNewStudentForm((value)=>!value)}>
                    <UserRoundPlus size={17}/> {showNewStudentForm ? "닫기" : "신규 등록"}
                  </button>
                </div>

                {showNewStudentForm && (
                  <div className="adminStudentNewForm">
                    <h2>새 수강생 등록</h2>
                    <label>이름</label>
                    <input value={studentName} onChange={e=>setStudentName(e.target.value)} placeholder="수강생 이름"/>
                    <label>휴대폰 번호 뒤 4자리</label>
                    <input value={phoneLast4} maxLength={4} inputMode="numeric"
                      onChange={e=>setPhoneLast4(e.target.value)} placeholder="0000"/>
                    <div className="adminStudentFormPair">
                      <div><label>수강권 잔여 횟수</label>
                        <input type="number" min="0" step="0.5" value={lessonCredits}
                          onChange={e=>setLessonCredits(e.target.value)}/></div>
                      <div><label>수업 유형</label>
                        <select value={lessonDurationMinutes} onChange={e=>setLessonDurationMinutes(e.target.value)}>
                          <option value="45">45분</option><option value="90">90분</option><option value="120">120분</option>
                        </select></div>
                    </div>
                    <label>수강권 등록일</label>
                    <input type="date" value={passRegisteredAt} onChange={e=>setPassRegisteredAt(e.target.value)}/>
                    <p className="adminValidityHint">사용기간: 첫 수업일로부터 10주 이내</p>
                    <button type="button" className="adminFormSubmit" onClick={addStudent}>수강생 등록하기</button>
                  </div>
                )}

                <div className="adminEnrollmentTabs" role="tablist" aria-label="수강생 재원 상태">
                  <button type="button" role="tab" aria-selected={enrollmentFilter === "active"}
                    className={`adminEnrollmentTab ${enrollmentFilter === "active" ? "selected" : ""}`}
                    onClick={() => switchEnrollmentFilter("active")}>
                    재원생 <span>{activeStudentCount}</span>
                  </button>
                  <button type="button" role="tab" aria-selected={enrollmentFilter === "inactive"}
                    className={`adminEnrollmentTab ${enrollmentFilter === "inactive" ? "selected" : ""}`}
                    onClick={() => switchEnrollmentFilter("inactive")}>
                    퇴원생 <span>{inactiveStudentCount}</span>
                  </button>
                </div>
                <label className="adminRosterSearchLabel" htmlFor="adminStudentSearch">{enrollmentFilter === "active" ? "재원생" : "퇴원생"} 찾기 · 가나다순</label>
                <div className="adminRosterSearch">
                  <Search size={18} />
                  <input id="adminStudentSearch" value={studentSearch}
                    onChange={e=>setStudentSearch(e.target.value)}
                    placeholder="이름 또는 전화번호 뒤 4자리 검색" />
                </div>
                <div className="adminRosterCount">{enrollmentFilter === "active" ? "재원생" : "퇴원생"} {enrollmentFilter === "active" ? activeStudentCount : inactiveStudentCount}명 · 표시 {visibleStudents.length}명</div>
                <div className="adminRosterNames" role="group" aria-label="가나다순 수강생 목록">
                  {visibleStudents.map(student => (
                    <button type="button" key={student.id}
                      className={`adminRosterName ${student.id===selectedStudentId ? "selected" : ""}`}
                      aria-pressed={student.id===selectedStudentId}
                      onClick={()=>selectStudent(student.id)}>
                      <strong>{student.name}</strong>
                      <span>{Number(student.lesson_credits ?? 0).toLocaleString("ko-KR")}회</span>
                    </button>
                  ))}
                </div>
                {visibleStudents.length===0 && <p className="adminAlertEmpty">{studentSearch ? "검색 결과가 없습니다." : "해당 목록에 수강생이 없습니다."}</p>}
              </section>

              {!selectedStudent && (
                <section className="card adminSelectStudentEmpty">
                  <UsersRound size={25} />
                  <p>위에서 수강생 이름을 선택하면 수강권과 수업일지를 확인할 수 있어요.</p>
                </section>
              )}

              {selectedStudent && [selectedStudent].map(s=>{
                const edit=studentEdits[s.id] || {
                  name:s.name,phone_last4:s.phone_last4,memo:s.memo||"",
                  lesson_credits:String(s.lesson_credits??0),
                  lesson_duration_minutes:String(s.lesson_duration_minutes??90),
                  pass_registered_at:s.pass_registered_at||"",
                  pass_first_lesson_at:s.pass_first_lesson_at||"",
                  pass_extension_used:Boolean(s.pass_extension_used),
                  pass_extension_until:s.pass_extension_until||"",
                  pass_extension_reason:s.pass_extension_reason||"",
                  is_active:s.is_active!==false,
                };
                const isEditing=editingStudentId===s.id;
                return (
                  <section key={s.id} className="card adminSelectedStudentCard">
                    <div className="adminSelectedStudentHeading">
                      <div><p className="adminEyebrow">선택한 수강생</p><h2>{s.name}</h2>
                        <span>{s.phone_last4} · {s.is_active === false ? "퇴원생 · 예약 중지" : "재원생 · 예약 가능"}</span>
                      </div>
                      {!isEditing && <button type="button" className="adminSmallAction"
                        onClick={()=>setEditingStudentId(s.id)}>정보 수정</button>}
                    </div>

                    {!isEditing ? (
                      <>
                        <div className="adminStudentInfoGrid">
                          <div><span>남은 수강권</span><strong>{s.lesson_credits ?? 0}회</strong></div>
                          <div><span>수업 유형</span><strong>{s.lesson_duration_minutes ?? 90}분</strong></div>
                          <div className="wide"><span>수강권 등록일</span><strong>{s.pass_registered_at || "미등록"}</strong></div>
                          <div className="wide"><span>사용기간</span><strong>{passPolicySummary(s)}</strong></div>
                        </div>
                        <button type="button" className="adminRecordLink" onClick={()=>openStudentHistory(s.id)}>
                          기존 수강 기록 확인 <ChevronRight size={18}/>
                        </button>
                        <div className="adminEnrollmentActions">
                          <button type="button" className={`adminEnrollmentMove ${s.is_active === false ? "reactivate" : "deactivate"}`}
                            disabled={enrollmentSaving}
                            onClick={() => void updateEnrollmentStatus(s, s.is_active === false)}>
                            {enrollmentSaving ? "변경 중..." : s.is_active === false ? "재원생으로 다시 등록" : "퇴원생으로 이동"}
                          </button>
                          <p className="small">{s.is_active === false
                            ? "재원생으로 전환하면 기존 계정으로 다시 예약할 수 있습니다."
                            : "퇴원 처리해도 수강권과 수업 기록은 삭제되지 않습니다."}</p>
                        </div>
                      </>
                    ) : (
                      <div className="adminStudentEditForm">
                        <label>이름</label>
                        <input value={edit.name} onChange={e=>setStudentEdits(current=>({
                          ...current,[s.id]:{...edit,name:e.target.value}}))}/>
                        <label>휴대폰 번호 뒤 4자리</label>
                        <input maxLength={4} inputMode="numeric" value={edit.phone_last4}
                          onChange={e=>setStudentEdits(current=>({
                            ...current,[s.id]:{...edit,phone_last4:e.target.value}}))}/>
                        <div className="adminStudentFormPair">
                          <div><label>남은 수강권</label>
                            <input type="number" min="0" step="0.5" value={edit.lesson_credits}
                              onChange={e=>setStudentEdits(current=>({
                                ...current,[s.id]:{...edit,lesson_credits:e.target.value}}))}/></div>
                          <div><label>수업 유형</label>
                            <select value={edit.lesson_duration_minutes}
                              onChange={e=>setStudentEdits(current=>({
                                ...current,[s.id]:{...edit,lesson_duration_minutes:e.target.value}}))}>
                              <option value="45">45분</option><option value="90">90분</option><option value="120">120분</option>
                            </select></div>
                        </div>
                        <label>수강권 등록일</label>
                        <input type="date" value={edit.pass_registered_at}
                          onChange={e=>setStudentEdits(current=>({
                            ...current,[s.id]:{...edit,pass_registered_at:e.target.value}}))}/>
                        <p className="adminValidityHint">{passPolicySummary(s)}</p>
                        <div className="adminStudentFormActions">
                          <button type="button" onClick={()=>updateStudent(s.id)}>변경 사항 저장</button>
                          <button type="button" className="secondary" onClick={()=>cancelStudentEdit(s)}>취소</button>
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}

              {selectedStudent && (
                <section className="card adminJournalCard">
                  <div className="adminJournalHeading">
                    <div>
                      <p className="adminEyebrow">1:1 수업 기록</p>
                      <h2>{selectedStudent.name}님의 수업일지</h2>
                    </div>
                    <NotebookPen size={22}/>
                  </div>
                  <p className="small">수업을 마친 뒤 일지를 저장하세요. 카카오톡 공유 시 수강생과 전송 대상을 직접 선택합니다.</p>

                  <div id="journal-editor" className="adminJournalEditor">
                    <h3>{journalDraft.id ? "수업일지 수정" : "새 수업일지 작성"}</h3>
                    <label>마친 수업 선택 <span className="small">(선택 사항)</span></label>
                    <select value={journalDraft.booking_id} onChange={e=>selectJournalBooking(e.target.value)}>
                      <option value="">직접 날짜 입력</option>
                      {selectedStudentBookings.map(booking=>(
                        <option key={booking.id} value={booking.id}>
                          {formatDateTime(booking.start_at)} · {STATUS_LABELS[booking.status] || "예약"}
                        </option>
                      ))}
                    </select>
                    <label>수업일</label>
                    <input type="date" value={journalDraft.lesson_date}
                      max={todaySeoulDateKey()}
                      disabled={Boolean(journalDraft.booking_id)}
                      onChange={e=>setJournalDraft(current=>({...current,lesson_date:e.target.value}))}/>
                    <label>수업 주제</label>
                    <input value={journalDraft.title}
                      onChange={e=>setJournalDraft(current=>({...current,title:e.target.value}))}
                      placeholder="예: 서평에서 나만의 질문 찾기"/>
                    <label>오늘 다룬 내용</label>
                    <textarea rows={4} value={journalDraft.lesson_summary}
                      onChange={e=>setJournalDraft(current=>({...current,lesson_summary:e.target.value}))}
                      placeholder="오늘 읽고 쓰고 이야기한 내용을 기록해 주세요."/>
                    <label>수강생 피드백</label>
                    <textarea rows={3} value={journalDraft.feedback}
                      onChange={e=>setJournalDraft(current=>({...current,feedback:e.target.value}))}
                      placeholder="잘한 점과 다음에 발전시키면 좋을 점"/>
                    <label>다음 수업까지의 과제</label>
                    <textarea rows={2} value={journalDraft.homework}
                      onChange={e=>setJournalDraft(current=>({...current,homework:e.target.value}))}
                      placeholder="예: 책 1권 읽고 질문 3개 정리하기"/>
                    <label>선생님만 보는 메모 <span className="small">(카카오톡에는 포함되지 않아요)</span></label>
                    <textarea rows={2} value={journalDraft.private_note}
                      onChange={e=>setJournalDraft(current=>({...current,private_note:e.target.value}))}
                      placeholder="수업 준비에 필요한 내부 기록"/>
                    <div className="adminStudentFormActions">
                      <button type="button" onClick={saveJournal}
                        disabled={journalSaving || !journalDraft.lesson_date || !journalDraft.title.trim() || !journalDraft.lesson_summary.trim()}>
                        {journalSaving ? "저장 중..." : journalDraft.id ? "수업일지 수정 저장" : "수업일지 저장"}
                      </button>
                      {journalDraft.id && (
                        <button type="button" className="secondary"
                          onClick={()=>setJournalDraft({...EMPTY_JOURNAL,lesson_date:todaySeoulDateKey()})}>수정 취소</button>
                      )}
                    </div>
                  </div>

                  {journalFeedback && <p className="adminJournalFeedback" role="status">{journalFeedback}</p>}
                  <div className="adminJournalHistory">
                    <h3>저장된 수업일지 <small>{journals.length}건</small></h3>
                    {journalsLoading && <p className="small">수업일지를 불러오는 중입니다...</p>}
                    {!journalsLoading && journals.length===0 && <p className="adminAlertEmpty">아직 작성한 수업일지가 없습니다.</p>}
                    {journals.map(journal=>(
                      <article className="adminJournalItem" key={journal.id}>
                        <div className="adminJournalItemHeading">
                          <div><small>{journal.lesson_date}</small><strong>{journal.title}</strong></div>
                          <button type="button" className="adminTextLink" onClick={()=>editJournal(journal)}>수정</button>
                        </div>
                        <p>{journal.lesson_summary}</p>
                        {journal.feedback && <p className="adminJournalDetail"><b>피드백</b> {journal.feedback}</p>}
                        {journal.homework && <p className="adminJournalDetail"><b>과제</b> {journal.homework}</p>}
                        <div className="adminJournalActions">
                          <button type="button" onClick={()=>shareJournalMessage(journal)}>
                            <Send size={16}/> 카카오톡 공유
                          </button>
                          <button type="button" className="secondary"
                            onClick={()=>copyJournalMessage(journal)}><Copy size={15}/> 복사</button>
                          <button type="button" className="adminJournalDelete"
                            onClick={()=>deleteJournal(journal)}>삭제</button>
                        </div>
                        {journalPreviewId===journal.id && (
                          <div className="adminJournalPreview">
                            <strong>수강생에게 보낼 메시지</strong>
                            <textarea readOnly rows={10}
                              value={journalKakaoMessage(selectedStudent.name,journal)}/>
                            <p className="small">발송은 자동으로 처리되지 않습니다. 카카오톡에서 받는 사람과 전송 여부를 확인해 주세요.</p>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}
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
              <section className="card adminMonthOpenCard">
                <button className="adminBackButton" type="button" onClick={()=>openTab("schedule")}>
                  <ChevronLeft size={18}/> 일정관리
                </button>
                <p className="adminEyebrow">정규 수업 일정</p>
                <h1>월별 수업 열기</h1>
                <p className="small">원하는 월을 선택하면 수·목·금, 토·일 공식 수업 시간 중 빠진 시간을 추가합니다.</p>
                <label htmlFor="adminMonthYear">열어둘 수업 월</label>
                <div className="adminMonthPickerRow" role="group" aria-label="열어둘 수업 연도와 월">
                  <select id="adminMonthYear" aria-label="수업 연도" value={monthToOpen.slice(0, 4)}
                    onChange={e=>setMonthToOpen(`${e.target.value}-${monthToOpen.slice(5, 7)}`)}>
                    {Array.from({length: 7}, (_,i)=> 2026+i).map(year=>(
                      <option key={year} value={year}>{year}년</option>
                    ))}
                  </select>
                  <select aria-label="수업 월" value={monthToOpen.slice(5,7)}
                    onChange={e=>setMonthToOpen(`${monthToOpen.slice(0,4)}-${e.target.value}`)}>
                    {Array.from({length: 12}, (_,i)=>String(i+1).padStart(2,"0")).map(month=>(
                      <option key={month} value={month}
                        disabled={monthToOpen.startsWith("2026-") && Number(month)<10}>
                        {Number(month)}월
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" className="adminFormSubmit"
                  disabled={monthlyOpening} onClick={openMonthlySchedule}>
                  {monthlyOpening ? "시간표를 준비하는 중..." : `${monthToOpen.replace("-","년 ")}월 수업 열기`}
                </button>
                <p className="adminValidityHint">기존 예약과 닫아둔 시간은 유지됩니다. 월·화요일은 자동으로 열리지 않습니다.</p>
              </section>

              <section className="card adminAdvancedToolsToggle">
                <button type="button" className="adminAdvancedButton"
                  onClick={()=>setShowScheduleAdvanced(value=>!value)}>
                  {showScheduleAdvanced ? "추가 관리 기능 닫기" : "추가 관리 기능 열기"}
                  <ChevronRight size={18}/>
                </button>
                <p className="small">특정 월·화요일 수업 열기, 시간 직접 등록, 정규 예약 확인이 필요할 때 이용하세요.</p>
              </section>
              {showScheduleAdvanced && (
                <>
                  <section className="card">
                    <h2>정규 예약·시간 확인</h2>
                    <div className="adminScheduleAdvancedLinks">
                      <button type="button" onClick={()=>openTab("bookings")}>정규 예약 달력·직접 예약</button>
                      <button type="button" onClick={()=>openTab("slots")}>등록된 예약 가능 시간</button>
                      <Link href="/admin/schedule">통합 스케줄 확인</Link>
                    </div>
                  </section>
              <section className="card">
                <h2>월·화요일 휴무 관리</h2>
                <p className="small">월·화요일은 자동으로 열리지 않습니다. 수업할 날짜를 선택하면 수요일과 동일한 45분·90분 정규수업 및 15:40 생활수업 시간표가 등록됩니다. 기존 예약과 수강권은 변경되지 않습니다.</p>
                <label>수업을 열 날짜 (월요일 또는 화요일)</label>
                <input type="date" min="2026-10-01" value={openMondayTuesdayDate} onChange={(e) => setOpenMondayTuesdayDate(e.target.value)} />
                <p className="small">10월 19·20·26·27일은 이미 직접 개방한 보호 일정으로, 열기/닫기 작업에서 제외됩니다.</p>
                <button disabled={isProtectedOctoberDate(openMondayTuesdayDate)} onClick={openMondayTuesdaySlots}>선택한 월·화요일 수업 열기</button>
                <button className="secondary" disabled={isProtectedOctoberDate(openMondayTuesdayDate)} onClick={closeMondayTuesdaySlots}>선택한 월·화요일 수업 닫기</button>
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
                  <option value="45">45분 수업</option>
                  <option value="90">90분 수업</option>
                  <option value="120">120분 수업</option>
                </select>
                {adjustedStartAt && (
                  <p className="small">예상 수업 시간: {adjustedStartAt.replace("T", " ")} - {addMinutesToLocalDateTime(adjustedStartAt, Number(adjustedLessonMinutes) === 45 ? 45 : Number(adjustedLessonMinutes) === 120 ? 120 : 90).replace("T", " ")}</p>
                )}
                <button onClick={addAdjustedSlot}>조율 슬롯 등록</button>
              </section>

                </>
              )}
            </>
          )}

          {activeTab === "slots" && (
            <section className="card">
              <div className="row between">
                <h2>예약 가능 시간 목록</h2>
                <button className="secondary compact" onClick={() => openTab("schedule")}>← 일정관리로</button>
              </div>
              <p className="small">수강생 화면에 열릴 수 있는 시간 목록입니다. 이미 예약과 겹치거나 수업 3시간 이내인 시간은 수강생 화면에서 자동으로 제외됩니다. 예약이 연결되지 않은 시간은 삭제할 수 있습니다.</p>
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
                <h2>일정관리 › 외부 차단</h2>
                <button className="secondary compact" onClick={() => openTab("schedule")}>← 일정관리로</button>
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
                <button className="secondary compact" onClick={() => openTab("schedule")}>← 일정관리로</button>
              </div>
              <p className="small">예약된 정규수업을 날짜별로 확인할 수 있습니다. 정상 취소된 예약은 숨기고, 수강권이 차감된 취소건만 표시합니다.</p>
              <div className="policyBox">
                <strong>관리자 직접 예약</strong>
                <p className="small">120분 수강생처럼 선생님이 직접 일정을 조율한 경우 여기서 정규수업을 등록합니다. 등록된 수업은 수강생 예약 앱의 내 수업 일정과 예약내역에 바로 표시됩니다.</p>
                <label>수강생</label>
                <select value={adminBookingStudentId} onChange={(e) => setAdminBookingStudentId(e.target.value)}>
                  <option value="">수강생 선택</option>
                  {overview.students.filter((student) => student.is_active !== false).map((student) => (
                    <option key={student.id} value={student.id}>{student.name} / {student.phone_last4} / {student.lesson_duration_minutes ?? 90}분</option>
                  ))}
                </select>
                <label>수업 시작 시간</label>
                <input type="datetime-local" value={adminBookingStartAt} onChange={(e) => setAdminBookingStartAt(e.target.value)} />
                <label>수업 길이</label>
                <select value={adminBookingLessonMinutes} onChange={(e) => setAdminBookingLessonMinutes(e.target.value)}>
                  <option value="45">45분 수업</option>
                  <option value="90">90분 수업</option>
                  <option value="120">120분 수업</option>
                </select>
                {adminBookingStartAt && (
                  <p className="small">예상 수업 시간: {adminBookingStartAt.replace("T", " ")} - {addMinutesToLocalDateTime(adminBookingStartAt, Number(adminBookingLessonMinutes) === 45 ? 45 : Number(adminBookingLessonMinutes) === 120 ? 120 : 90).replace("T", " ")}</p>
                )}
                <label className="checkboxLabel">
                  <input type="checkbox" checked={adminBookingDeductCredit} onChange={(e) => setAdminBookingDeductCredit(e.target.checked)} />
                  수강권 1회 차감
                </label>
                <label>예약 메모</label>
                <input value={adminBookingMemo} onChange={(e) => setAdminBookingMemo(e.target.value)} placeholder="예: 120분 수업 직접 조율" />
                <button onClick={createAdminRegularBooking}>관리자 예약 등록</button>
              </div>
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
                  <p className="small">예약 신청은 수업 3시간 전까지 가능하고, 예약 취소는 수업 3시간 전까지 가능합니다. 3시간 이내 취소 시 수강권이 차감됩니다.</p>
                </div>
                <div className="item">
                  <strong>정규수업 운영</strong>
                  <p className="small">수강생별 45분/90분/120분 수업 유형을 수강생 관리에서 지정합니다. 120분 수업은 관리자 직접 예약으로 운영합니다.</p>
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
                <p className="small">원데이 클래스 생성 후에도 아래 목록에서 제목, 커리큘럼, 일정, 비용, 정원, 노출 여부를 수정하거나 클래스를 삭제할 수 있습니다.</p>
                <label>제목</label>
                <input value={onedayTitle} onChange={(e) => setOnedayTitle(e.target.value)} placeholder="예: 자서전쓰기 원데이 클래스" />
                <label>커리큘럼</label>
                <textarea value={onedayCurriculum} onChange={(e) => setOnedayCurriculum(e.target.value)} placeholder="예: 1. 기억 꺼내기 2. 장면 정리하기 3. 짧은 자서전 초안 쓰기" rows={5} />
                <label>수업 시작 일정</label>
                <input type="datetime-local" value={onedayStartAt} onChange={(e) => setOnedayStartAt(e.target.value)} />
                <label>수업 종료 일정</label>
                <input type="datetime-local" value={onedayEndAt} onChange={(e) => setOnedayEndAt(e.target.value)} />
                <p className="small">정원은 동반자를 포함해 6명으로 고정됩니다.</p>
                <label>정규수강생 추가 참석 비용</label>
                <input type="number" min="0" value={onedayRegularPrice} onChange={(e) => setOnedayRegularPrice(e.target.value)} placeholder="예: 10000" />
                <label>일반 수강 비용</label>
                <input type="number" min="0" value={onedayNormalPrice} onChange={(e) => setOnedayNormalPrice(e.target.value)} placeholder="예: 30000" />
                <p className="small">정규수강생은 매월 원데이 1회 무료, 같은 달 2회차부터 정규수강생 추가 참석 비용이 적용됩니다.</p>
                <button onClick={addOnedayClass}>원데이 클래스 추가</button>
              </section>

              <section className="card onedayGroupedCard">
                <div className="sectionHeaderRow">
                  <div>
                    <p className="eyebrow">원데이 관리</p>
                    <h2>원데이 클래스 일정</h2>
                    <p className="small">이번 주 진행 예정, 다가오는 수업, 지난 수업을 나누어 보여줍니다. 필요한 수업만 펼쳐 보듯 확인하면 됩니다.</p>
                  </div>
                </div>
                {overview.classes.length === 0 && <p>등록된 원데이 클래스가 없습니다.</p>}
                <div className="onedayGroupList">
                  {oneDayClassScheduleGroups.map((group) => (
                    <section className="onedayScheduleGroup" key={group.id}>
                      <div className="onedayGroupHeader">
                        <div>
                          <h3>{group.title}</h3>
                          <p className="small">{group.description}</p>
                        </div>
                        <span>{group.classes.length}개</span>
                      </div>
                      <div className="list compactList">
                        {group.classes.length === 0 ? (
                          <p className="emptyGroupText">{group.emptyText}</p>
                        ) : (
                          group.classes.map((c) => renderOneDayClassCard(c))
                        )}
                      </div>
                    </section>
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
          <nav className="adminBottomNav" aria-label="문장학교 관리자 메뉴">
            {TAB_LABELS.map(({id,label,Icon}) => {
              const active=isTopMenuActive(id);
              return (
                <button type="button" key={id} onClick={() => openTab(id)}
                  className={`adminBottomNavItem ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}>
                  <Icon size={22} strokeWidth={active ? 2.3 : 1.75} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </>
      )}
      <style jsx>{`
        .onedayGroupedCard {
          background: linear-gradient(180deg, #fffdfa 0%, #fff7f3 100%);
        }
        .onedayGroupList {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .onedayScheduleGroup {
          padding: 14px;
          border: 1px solid #eadfce;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.78);
        }
        .onedayGroupHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          padding-bottom: 10px;
          border-bottom: 1px solid #eadfce;
        }
        .onedayGroupHeader h3 {
          margin: 0 0 4px;
        }
        .onedayGroupHeader span {
          flex-shrink: 0;
          padding: 5px 10px;
          border-radius: 999px;
          background: #f2eadf;
          color: #6b5948;
          font-size: 12px;
          font-weight: 800;
        }
        .onedayClassCard {
          border-left: 6px solid #b58ac8;
          background: #fffefa;
        }
        .onedayClassCard.pastClass {
          border-left-color: #aaa29a;
          opacity: 0.88;
        }
        .oneDayClassRow {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .oneDayClassMain {
          min-width: 0;
          flex: 1;
        }
        .oneDayClassTopline {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 6px;
        }
        .onedayClassStats {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 8px 0;
        }
        .onedayClassStats span {
          padding: 5px 9px;
          border-radius: 999px;
          background: #f6efe8;
          color: #6f5e4e;
          font-size: 12px;
          font-weight: 700;
        }
        .onedayCurriculumPreview {
          margin: 8px 0 0;
          padding: 10px;
          border-radius: 12px;
          background: #fff7ed;
          color: #5f5044;
          white-space: pre-wrap;
        }
        .oneDayClassActions {
          flex-shrink: 0;
        }
        .emptyGroupText {
          margin: 8px 0 0;
          color: #84766a;
        }
        .todayCard {
          border-color: #d8c2a4;
          background: linear-gradient(180deg, #fffdf8 0%, #fff8ee 100%);
        }
        .dashboardFirstCard {
          border: 2px solid #8f2446;
          box-shadow: 0 18px 44px rgba(143, 36, 70, 0.12);
        }
        .todayOnlyTimeline {
          margin-top: 6px;
        }
        .todayOnlyEmpty {
          margin-top: 4px;
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
        .dailyScheduleList {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .dailyScheduleGroup {
          padding: 14px;
          border: 1px solid #eadfce;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.72);
        }
        .dailyDateHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          padding-bottom: 10px;
          border-bottom: 1px solid #eadfce;
        }
        .dailyDateHeader strong {
          color: #3f342b;
          font-size: 17px;
        }
        .dailyDateHeader span {
          flex-shrink: 0;
          padding: 4px 9px;
          border-radius: 999px;
          background: #f2eadf;
          color: #6b5948;
          font-size: 12px;
          font-weight: 800;
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
          .dailyScheduleGroup { padding: 12px; }
          .dailyDateHeader { align-items: flex-start; flex-direction: column; gap: 6px; }
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
