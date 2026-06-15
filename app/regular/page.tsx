"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Student = { id: string; name: string; phone_last4: string };
type Slot = { id: string; start_at: string; end_at: string };
type Booking = { id: string; start_at: string; end_at: string; status: string; memo?: string };

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
  const [student, setStudent] = useState<Student | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  async function login() {
    setMessage("");
    setLoading(true);
    const res = await fetch("/api/student/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone_last4: phoneLast4 }),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(json.message || "입장할 수 없습니다.");
      return;
    }
    setStudent(json.student);
  }

  async function loadData(studentId: string) {
    const [slotRes, bookingRes] = await Promise.all([
      fetch("/api/slots"),
      fetch(`/api/student/bookings?studentId=${studentId}`),
    ]);
    const slotJson = await slotRes.json();
    const bookingJson = await bookingRes.json();
    setSlots(slotJson.slots || []);
    setBookings(bookingJson.bookings || []);
  }

  useEffect(() => {
    if (student) loadData(student.id);
  }, [student]);

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

  useEffect(() => {
    if (slots.length === 0) return;
    const firstSlot = [...slots].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())[0];
    const key = seoulDateKey(firstSlot.start_at);
    const parts = seoulParts(firstSlot.start_at);
    setSelectedDate((current) => current || key);
    setCalendarMonth({ year: parts.year, month: parts.month });
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
    setMessage("예약이 완료되었습니다.");
    await loadData(student.id);
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
    setMessage("취소 요청이 접수되었습니다.");
    await loadData(student.id);
  }

  return (
    <main className="container">
      <Link href="/" className="small">← 처음으로</Link>
      <section className="card">
        <h1>정규수업 예약</h1>
        {!student ? (
          <div>
            <p>정규 수강생 전용 예약 페이지입니다. 이름과 핸드폰번호 뒷자리 4자리를 입력해 주세요.</p>
            <label>이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: test" />
            <label>핸드폰번호 뒷자리 4자리</label>
            <input value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value)} placeholder="예: 1234" maxLength={4} />
            <button onClick={login} disabled={loading}>{loading ? "확인 중..." : "입장하기"}</button>
          </div>
        ) : (
          <div>
            <h2>안녕하세요, {student.name}님.</h2>
            <p>달력에서 날짜를 선택한 뒤, 가능한 시간을 예약해 주세요.</p>
          </div>
        )}
        {message && <p className={message.includes("완료") || message.includes("접수") ? "success" : "error"}>{message}</p>}
      </section>

      {student && (
        <>
          <section className="card">
            <h2>내 예약</h2>
            <div className="list">
              {bookings.length === 0 && <p>현재 예약 내역이 없습니다.</p>}
              {bookings.map((booking) => (
                <div className="item" key={booking.id}>
                  <strong>{formatDateTime(booking.start_at)} - {formatTime(booking.end_at)}</strong>
                  <p className="small">상태: {booking.status}</p>
                  {booking.status === "booked" && <button className="danger" onClick={() => cancel(booking.id)}>취소 요청하기</button>}
                </div>
              ))}
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
                    disabled={!day.key || count === 0}
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
              {slots.length === 0 && <p>현재 예약 가능한 시간이 없습니다.</p>}
              {slots.length > 0 && selectedSlots.length === 0 && <p>선택한 날짜에는 예약 가능한 시간이 없습니다.</p>}
              <div className="timeGrid">
                {selectedSlots.map((slot) => (
                  <button className="timeButton" key={slot.id} onClick={() => book(slot.id)}>
                    {formatTime(slot.start_at)} - {formatTime(slot.end_at)} 예약하기
                  </button>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
