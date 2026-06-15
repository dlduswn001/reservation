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
  start_at: string;
  end_at: string;
  status: string;
  memo?: string;
  students?: { name?: string; phone_last4?: string } | null;
};

type Overview = {
  students: Student[];
  slots: any[];
  bookings: Booking[];
  classes: any[];
  onedayBookings: any[];
};

const STATUS_LABELS: Record<string, string> = {
  booked: "예약 완료",
  cancelled: "취소 완료",
  late_cancelled: "6시간 이내 취소",
  done: "수업 완료",
  change_request: "변경 요청",
  cancel_request: "취소 요청",
};

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
  const [studentName, setStudentName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [memo, setMemo] = useState("");
  const [lessonCredits, setLessonCredits] = useState("4");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [generateStartDate, setGenerateStartDate] = useState("");
  const [generateWeeks, setGenerateWeeks] = useState("8");
  const [creditEdits, setCreditEdits] = useState<Record<string, string>>({});
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
    const nextEdits: Record<string, string> = {};
    for (const student of json.students || []) {
      nextEdits[student.id] = String(student.lesson_credits ?? 0);
    }
    setCreditEdits(nextEdits);

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
  }

  async function updateCredits(studentId: string) {
    setMessage("");
    const res = await fetch(`/api/admin/students/${studentId}/credits`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, lesson_credits: Number(creditEdits[studentId] || 0) }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "수강권 횟수를 변경할 수 없습니다.");
      return;
    }
    setMessage("수강권 횟수를 변경했습니다.");
    await loadOverview();
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
  }

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

  function moveBookingMonth(direction: -1 | 1) {
    setBookingCalendarMonth((current) => {
      const date = new Date(current.year, current.month - 1 + direction, 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    });
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
          <section className="card">
            <h2>정규 수강생 등록</h2>
            <label>이름</label>
            <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="예: 테스트학생" />
            <label>핸드폰번호 뒷자리 4자리</label>
            <input value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value)} placeholder="예: 1234" maxLength={4} />
            <label>수강권 잔여 횟수</label>
            <input type="number" min="0" value={lessonCredits} onChange={(e) => setLessonCredits(e.target.value)} placeholder="예: 4" />
            <label>메모</label>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 테스트용" />
            <button onClick={addStudent}>수강생 등록</button>
          </section>

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

          <section className="card">
            <h2>수강생 목록</h2>
            <p className="small">수강권 잔여 횟수는 수업 예약 시 1회 차감되고, 수업 6시간 전까지 취소하면 1회 복구됩니다. 수업 6시간 이내 취소는 차감된 상태로 유지됩니다.</p>
            <div className="list">
              {overview.students.map((s) => (
                <div className="item" key={s.id}>
                  <div className="row between">
                    <div>
                      <strong>{s.name}</strong> / {s.phone_last4}
                      <p className="small">메모: {s.memo || "-"}</p>
                    </div>
                    <button className="danger compact" onClick={() => deleteStudent(s.id, s.name)}>삭제</button>
                  </div>
                  <div className="row creditsRow">
                    <label className="inlineLabel">수강권 잔여 횟수</label>
                    <input
                      className="smallInput"
                      type="number"
                      min="0"
                      value={creditEdits[s.id] ?? String(s.lesson_credits ?? 0)}
                      onChange={(e) => setCreditEdits((current) => ({ ...current, [s.id]: e.target.value }))}
                    />
                    <button className="secondary compact" onClick={() => updateCredits(s.id)}>변경</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>예약 가능 시간 목록</h2>
            <div className="list">
              {overview.slots.map((slot) => (
                <div className="item" key={slot.id}><strong>{formatDateTime(slot.start_at)}</strong><p className="small">수업 종료: {formatDateTime(slot.end_at)} / 열림: {String(slot.is_open)}</p></div>
              ))}
            </div>
          </section>

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
        </>
      )}
    </main>
  );
}
