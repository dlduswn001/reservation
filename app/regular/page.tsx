"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BottomNav from "../components/BottomNav";

type Student = { id: string; name: string; phone_last4: string; lesson_credits?: number; lesson_duration_minutes?: number };
type Slot = { id: string; start_at: string; end_at: string; lesson_minutes?: number; break_minutes?: number; rule_label?: string; is_auto_adjustment?: boolean; adjustment_label?: string };
type Booking = { id: string; start_at: string; end_at: string; status: string; memo?: string };

const STUDENT_LOGIN_STORAGE_KEY = "munjangStudentLogin";

const STATUS_LABELS: Record<string, string> = {
  booked: "예약 완료",
  change_request: "변경 요청",
  cancel_request: "취소 요청",
  cancelled: "취소 완료",
  done: "수강 완료",
  in_progress: "수업 진행 중",
  late_cancelled: "6시간 이내 취소",
};

function readStoredStudentLogin() {
  try {
    const saved = window.localStorage.getItem(STUDENT_LOGIN_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as { id?: string; name?: string; phone_last4?: string };
    if (!parsed.name || !/^\d{4}$/.test(String(parsed.phone_last4 || ""))) return null;
    return { id: parsed.id || "", name: parsed.name, phone_last4: String(parsed.phone_last4) };
  } catch {
    return null;
  }
}

function saveStoredStudentLogin(student: Student) {
  try {
    window.localStorage.setItem(
      STUDENT_LOGIN_STORAGE_KEY,
      JSON.stringify({ id: student.id, name: student.name, phone_last4: student.phone_last4 }),
    );
  } catch {
    // 저장하지 못해도 예약 기능은 그대로 사용할 수 있습니다.
  }
}

function clearStoredStudentLogin() {
  try {
    window.localStorage.removeItem(STUDENT_LOGIN_STORAGE_KEY);
  } catch {
    // 무시
  }
}

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

function seoulParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

function seoulDateKey(value: string) {
  const { year, month, day } = seoulParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function todayDateKeyInSeoul() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
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

export default function RegularPage() {
  const [name, setName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [rememberLogin, setRememberLogin] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const [year, month] = todayDateKeyInSeoul().split("-").map(Number);
    return { year, month };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(() => todayDateKeyInSeoul());
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [bookingSection, setBookingSection] = useState<"upcoming" | "completed">("upcoming");

  async function login(customName?: string, customPhoneLast4?: string, shouldRemember = rememberLogin) {
    const loginName = String(customName ?? name).trim();
    const loginPhoneLast4 = String(customPhoneLast4 ?? phoneLast4).trim();
    setMessage("");

    if (!loginName || !/^\d{4}$/.test(loginPhoneLast4)) {
      setMessage("이름과 핸드폰번호 뒷자리 4자리를 정확히 입력해 주세요.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/student/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: loginName, phone_last4: loginPhoneLast4 }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(json.message || "입장할 수 없습니다.");
      return;
    }
    setStudent(json.student);
    setName(json.student.name);
    setPhoneLast4(json.student.phone_last4);
    if (shouldRemember) {
      saveStoredStudentLogin(json.student);
    } else {
      clearStoredStudentLogin();
    }
  }

  async function loadBookings(studentId: string) {
    const bookingRes = await fetch(`/api/student/bookings?studentId=${studentId}`);
    const bookingJson = await bookingRes.json();
    setBookings(bookingJson.bookings || []);
  }

  async function loadSlotsForDate(studentId: string, dateKey: string) {
    setSlotsLoading(true);
    try {
      const slotRes = await fetch(`/api/slots?studentId=${studentId}&date=${dateKey}`);
      const slotJson = await slotRes.json();
      setSlots(slotJson.slots || []);
    } finally {
      setSlotsLoading(false);
    }
  }

  async function refreshStudent() {
    if (!student) return;
    const res = await fetch("/api/student/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: student.name, phone_last4: student.phone_last4 }),
    });
    const json = await res.json();
    if (res.ok) setStudent(json.student);
  }

  useEffect(() => {
    const saved = readStoredStudentLogin();
    if (saved) {
      setName(saved.name);
      setPhoneLast4(saved.phone_last4);
      setRememberLogin(true);
      login(saved.name, saved.phone_last4, true);
    }
  }, []);

  useEffect(() => {
    if (student) loadBookings(student.id);
  }, [student]);

  useEffect(() => {
    if (student && selectedDate) loadSlotsForDate(student.id, selectedDate);
  }, [student, selectedDate]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  function bookingViewStatus(booking: Booking) {
    const startTime = new Date(booking.start_at).getTime();
    const endTime = new Date(booking.end_at).getTime();

    if (["booked", "change_request"].includes(booking.status) && endTime <= currentTime) {
      return "done";
    }
    if (booking.status === "booked" && startTime <= currentTime && endTime > currentTime) {
      return "in_progress";
    }
    return booking.status;
  }


  const upcomingBookings = useMemo(() => {
    return bookings
      .filter((booking) => bookingViewStatus(booking) !== "done")
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [bookings, currentTime]);

  const completedBookings = useMemo(() => {
    return bookings
      .filter((booking) => bookingViewStatus(booking) === "done")
      .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());
  }, [bookings, currentTime]);

  const visibleBookings = bookingSection === "upcoming" ? upcomingBookings : completedBookings;

  const slotsByDate = useMemo(() => {
    const grouped: Record<string, Slot[]> = {};
    for (const slot of slots) {
      const key = seoulDateKey(slot.start_at);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(slot);
    }
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    }
    return grouped;
  }, [slots]);

  const calendarDays = useMemo(
    () => buildCalendarDays(calendarMonth.year, calendarMonth.month),
    [calendarMonth]
  );

  const selectedSlots = selectedDate ? slotsByDate[selectedDate] || [] : [];

  function moveMonth(direction: -1 | 1) {
    setCalendarMonth((current) => {
      const date = new Date(current.year, current.month - 1 + direction, 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    });
  }

  async function book(slotId: string) {
    if (!student) return;
    setMessage("");
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: student.id, slotId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "예약할 수 없습니다.");
      return;
    }
    setMessage("예약이 완료되었습니다. 수강권 1회가 차감되었습니다.");
    await refreshStudent();
    await loadBookings(student.id);
    if (selectedDate) await loadSlotsForDate(student.id, selectedDate);
  }

  function logoutStudent() {
    clearStoredStudentLogin();
    setStudent(null);
    setName("");
    setPhoneLast4("");
    setSlots([]);
    setBookings([]);
    setSelectedDate(todayDateKeyInSeoul());
    setMessage("자동 로그인 정보를 지웠습니다. 다시 로그인해 주세요.");
  }

  async function cancel(bookingId: string) {
    if (!student) return;
    setMessage("");
    const res = await fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: student.id, bookingId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "취소 요청을 보낼 수 없습니다.");
      return;
    }
    setMessage(json.message || "예약이 취소되었습니다.");
    await refreshStudent();
    await loadBookings(student.id);
    if (selectedDate) await loadSlotsForDate(student.id, selectedDate);
  }

  return (
    <main className="container appContainer">
      <section className="card">
        <h1>정규수업 예약</h1>
        {!student ? (
          <div>
            <p>정규 수강생 전용 예약 페이지입니다. 이름과 핸드폰번호 뒷자리 4자리를 입력해 주세요.</p>
            <label>이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김문장" />
            <label>핸드폰번호 뒷자리 4자리</label>
            <input value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="예: 6789" inputMode="numeric" maxLength={4} />
            <label className="checkboxRow">
              <input type="checkbox" checked={rememberLogin} onChange={(e) => setRememberLogin(e.target.checked)} />
              <span>이 기기에서 자동 로그인하기</span>
            </label>
            <button onClick={() => login()} disabled={loading}>{loading ? "확인 중..." : "입장하기"}</button>
          </div>
        ) : (
          <div>
            <h2>안녕하세요, {student.name}님.</h2>
            <p>잔여 수강권: <strong>{student.lesson_credits ?? 0}회</strong></p>
            <div className="inlineActions">
              <button type="button" className="secondary compact" onClick={logoutStudent}>로그아웃 / 다른 수강생으로 로그인</button>
            </div>
            <div className="noticeBox">
              <p>수업 예약은 시작 6시간 전까지 가능합니다.</p>
              <p>수업 취소는 6시간 전까지 가능하며, 6시간 이내 취소 시 수강권이 차감됩니다.</p>
            </div>
          </div>
        )}
        {message && <p className={message.includes("완료") || message.includes("접수") ? "success" : "error"}>{message}</p>}
      </section>

      {student && (
        <>
          <section className="card">
            <h2>내 수업 일정</h2>
            <div className="bookingSectionTabs" role="tablist" aria-label="수업 일정 구분">
              <button
                type="button"
                className={`bookingSectionTab ${bookingSection === "upcoming" ? "active" : ""}`}
                onClick={() => setBookingSection("upcoming")}
                role="tab"
                aria-selected={bookingSection === "upcoming"}
              >
                예정된 수업 <span>{upcomingBookings.length}</span>
              </button>
              <button
                type="button"
                className={`bookingSectionTab ${bookingSection === "completed" ? "active" : ""}`}
                onClick={() => setBookingSection("completed")}
                role="tab"
                aria-selected={bookingSection === "completed"}
              >
                완료한 수업 <span>{completedBookings.length}</span>
              </button>
            </div>

            <div className="list bookingSectionList">
              {visibleBookings.length === 0 && bookingSection === "upcoming" && (
                <p>현재 예정된 정규수업이 없습니다.</p>
              )}
              {visibleBookings.length === 0 && bookingSection === "completed" && (
                <p>아직 완료한 정규수업이 없습니다.</p>
              )}

              {visibleBookings.map((booking) => {
                const viewStatus = bookingViewStatus(booking);
                const canCancel = bookingSection === "upcoming"
                  && booking.status === "booked"
                  && new Date(booking.start_at).getTime() > currentTime;

                return (
                  <div className={`item bookingItem ${viewStatus === "done" ? "completed" : ""}`} key={booking.id}>
                    <div>
                      <strong>{formatDateTime(booking.start_at)} - {formatTime(booking.end_at)}</strong>
                      <p className="small">상태: {STATUS_LABELS[viewStatus] || viewStatus}</p>
                    </div>
                    {canCancel && (
                      <button className="danger" onClick={() => cancel(booking.id)}>취소하기</button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <div className="calendarHeader">
              <button className="secondary compact" onClick={() => moveMonth(-1)}>이전 달</button>
              <h2>{calendarMonth.year}년 {calendarMonth.month}월</h2>
              <button className="secondary compact" onClick={() => moveMonth(1)}>다음 달</button>
            </div>

            <div className="calendarWeekdays">
              <span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>
            </div>

            <div className="calendarGrid">
              {calendarDays.map((day, index) => {
                const count = day.key ? slotsByDate[day.key]?.length || 0 : 0;
                const isSelected = day.key && selectedDate === day.key;
                return (
                  <button
                    key={`${day.key || "blank"}-${index}`}
                    className={`calendarDay ${count > 0 ? "hasSlots" : ""} ${isSelected ? "selected" : ""}`}
                    disabled={!day.key}
                    onClick={() => day.key && setSelectedDate(day.key)}
                  >
                    <span className="dayNumber">{day.day || ""}</span>
                    {count > 0 && <span className="slotBadge">{count}개</span>}
                  </button>
                );
              })}
            </div>

            <div className="selectedSlots">
              <h3>{selectedDate ? formatDateLabel(selectedDate) : "예약 가능한 날짜"}</h3>
              {(student.lesson_credits ?? 0) <= 0 && <p className="error">잔여 수강권이 없어 예약할 수 없습니다. 관리자에게 문의해 주세요.</p>}
              {slotsLoading && <p>선택한 날짜의 예약 가능 시간을 확인하는 중입니다.</p>}
              {!slotsLoading && selectedSlots.length === 0 && <p>선택한 날짜에는 예약 가능한 시간이 없습니다. 이미 예약된 시간과 6시간 이내 수업은 자동으로 보이지 않습니다.</p>}
              <div className="timeGrid">
                {!slotsLoading && selectedSlots.map((slot) => (
                  <button className="timeButton" key={slot.id} onClick={() => book(slot.id)} disabled={(student.lesson_credits ?? 0) <= 0}>
                    <span>{formatTime(slot.start_at)} - {formatTime(slot.end_at)} 예약하기</span>
                    {slot.is_auto_adjustment && <small>추천 시간</small>}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
      <BottomNav />
    </main>
  );
}
