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
  student_name: string;
  phone_last4?: string;
  people_count?: number;
  is_regular_student?: boolean;
  status?: string;
  created_at?: string;
  oneday_classes?: { title?: string } | null;
};

type Overview = {
  students: Student[];
  slots: any[];
  bookings: Booking[];
  classes: OneDayClass[];
  onedayBookings: OneDayBooking[];
  lessonHistory: LessonHistory[];
};

type AdminTab = "dashboard" | "students" | "history" | "timetable" | "slots" | "bookings" | "oneday";

const STATUS_LABELS: Record<string, string> = {
  booked: "예약 완료",
  cancelled: "취소 완료",
  late_cancelled: "6시간 이내 취소",
  done: "수업 완료",
  change_request: "변경 요청",
  cancel_request: "취소 요청",
};

const TAB_LABELS: Array<{ id: AdminTab; label: string }> = [
  { id: "dashboard", label: "한눈에 보기" },
  { id: "students", label: "수강생 관리" },
  { id: "history", label: "수강 기록" },
  { id: "timetable", label: "시간표 만들기" },
  { id: "slots", label: "예약 가능 시간" },
  { id: "bookings", label: "정규 예약 달력" },
  { id: "oneday", label: "원데이" },
];

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

function formatPrice(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toLocaleString("ko-KR")}원`;
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
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [generateStartDate, setGenerateStartDate] = useState("");
  const [generateWeeks, setGenerateWeeks] = useState("8");
  const [creditEdits, setCreditEdits] = useState<Record<string, string>>({});
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [studentEdits, setStudentEdits] = useState<Record<string, { name: string; phone_last4: string; memo: string; lesson_credits: string; is_active: boolean }>>({});
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
  const [bookingCalendarMonth, setBookingCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [selectedBookingDate, setSelectedBookingDate] = useState<string | null>(null);

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
    const nextStudentEdits: Record<string, { name: string; phone_last4: string; memo: string; lesson_credits: string; is_active: boolean }> = {};
    for (const student of json.students || []) {
      nextEdits[student.id] = String(student.lesson_credits ?? 0);
      nextStudentEdits[student.id] = {
        name: student.name || "",
        phone_last4: student.phone_last4 || "",
        memo: student.memo || "",
        lesson_credits: String(student.lesson_credits ?? 0),
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
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "수강생을 등록할 수 없습니다.");
      return;
    }
    setStudentName(""); setPhoneLast4(""); setMemo(""); setLessonCredits("4");
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
                  className={`tabButton ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => openTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          {activeTab === "dashboard" && (
            <section className="card">
              <h2>한눈에 보기</h2>
              <div className="statsGrid">
                <div className="statBox"><span>정규 수강생</span><strong>{overview.students.length}명</strong></div>
                <div className="statBox"><span>예약 가능 시간</span><strong>{overview.slots.length}개</strong></div>
                <div className="statBox"><span>정규 예약</span><strong>{activeBookingsCount}건</strong></div>
                <div className="statBox"><span>원데이 신청</span><strong>{overview.onedayBookings.length}건</strong></div>
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
          )}

          {activeTab === "students" && (
            <>
              <section className="card">
                <h2>정규 수강생 등록</h2>
                <label>이름</label>
                <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="예: 김문장" />
                <label>핸드폰번호 뒷자리 4자리</label>
                <input value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value)} placeholder="예: 6789" maxLength={4} />
                <label>수강권 잔여 횟수</label>
                <input type="number" min="0" value={lessonCredits} onChange={(e) => setLessonCredits(e.target.value)} placeholder="예: 4" />
                <label>메모</label>
                <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 주 1회 정규수업" />
                <button onClick={addStudent}>수강생 등록</button>
              </section>

              <section className="card">
                <h2>수강생 목록</h2>
                <p className="small">각 수강생의 ‘계정 수정’을 누르면 이름, 전화번호 뒷자리, 수강권, 메모, 이용 상태를 한 번에 수정할 수 있습니다.</p>
                <div className="list">
                  {overview.students.map((s) => {
                    const edit = studentEdits[s.id] || { name: s.name, phone_last4: s.phone_last4, memo: s.memo || "", lesson_credits: String(s.lesson_credits ?? 0), is_active: s.is_active !== false };
                    const isEditing = editingStudentId === s.id;
                    return (
                      <div className="item" key={s.id}>
                        {!isEditing ? (
                          <>
                            <div className="row between">
                              <div>
                                <strong>{s.name}</strong> / {s.phone_last4}
                                <p className="small">수강권: {s.lesson_credits ?? 0}회 / 상태: {s.is_active ? "이용 중" : "이용 중지"}</p>
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
              <section className="card">
                <h2>기본 타임테이블 자동 생성</h2>
                <p className="small">월-금 14:00-20:30, 토 10:00-16:30 사이를 30분 단위로 엽니다. 실제 수업은 80분으로 안내되고, 수업 후 10분 정리 시간을 포함해 총 90분 동안 다음 예약과 겹치지 않게 막습니다. 이미 있는 시간은 중복 등록되지 않습니다.</p>
                <label>시작 날짜</label>
                <input type="date" value={generateStartDate} onChange={(e) => setGenerateStartDate(e.target.value)} />
                <label>몇 주치 만들까요?</label>
                <input type="number" min="1" max="26" value={generateWeeks} onChange={(e) => setGenerateWeeks(e.target.value)} />
                <button onClick={generateTimetable}>기본 시간표 만들기</button>
              </section>

              <section className="card">
                <h2>예약 가능 시간 직접 등록</h2>
                <p className="small">예외적으로 추가할 시간만 직접 등록해 주세요. 종료 시간은 실제 수업 종료 시간인 80분 기준으로 입력하면 됩니다.</p>
                <label>시작 시간</label>
                <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                <label>수업 종료 시간</label>
                <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                <button onClick={addSlot}>시간 등록</button>
              </section>
            </>
          )}

          {activeTab === "slots" && (
            <section className="card">
              <h2>예약 가능 시간 목록</h2>
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

          {activeTab === "bookings" && (
            <section className="card">
              <h2>정규수업 예약 달력</h2>
              <p className="small">예약된 정규수업을 날짜별로 확인할 수 있습니다. 표시되는 종료 시간은 실제 수업 종료 시간입니다. 수업 후 10분은 정리 시간으로 자동 확보됩니다.</p>
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
                <label>정규 수강생 비용</label>
                <input type="number" min="0" value={onedayRegularPrice} onChange={(e) => setOnedayRegularPrice(e.target.value)} placeholder="예: 10000" />
                <label>일반 비용</label>
                <input type="number" min="0" value={onedayNormalPrice} onChange={(e) => setOnedayNormalPrice(e.target.value)} placeholder="예: 30000" />
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
                          <p className="small">비용: 정규생 {formatPrice(c.regular_price)} / 일반 {formatPrice(c.normal_price)}</p>
                          {c.description && <p>커리큘럼: {c.description}</p>}
                        </div>
                        <button className="danger compact" onClick={() => deleteOnedayClass(c.id, c.title)}>삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card">
                <h2>원데이 신청 목록</h2>
                <div className="list">
                  {overview.onedayBookings.length === 0 && <p>원데이 신청 내역이 없습니다.</p>}
                  {overview.onedayBookings.map((b) => (
                    <div className="item" key={b.id}>
                      <strong>{b.student_name}</strong>
                      <p className="small">클래스: {b.oneday_classes?.title || "-"} / 인원: {b.people_count || 1}명 / 정규생 여부: {b.is_regular_student ? "정규생" : "일반"} / 상태: {b.status || "-"}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
