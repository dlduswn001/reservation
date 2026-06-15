"use client";

import { useEffect, useState } from "react";
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

export default function RegularPage() {
  const [name, setName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

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
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 테스트학생" />
            <label>핸드폰번호 뒷자리 4자리</label>
            <input value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value)} placeholder="예: 1234" maxLength={4} />
            <button onClick={login} disabled={loading}>{loading ? "확인 중..." : "입장하기"}</button>
          </div>
        ) : (
          <div>
            <h2>안녕하세요, {student.name}님.</h2>
            <p>아래에서 예약 가능한 시간을 선택할 수 있습니다.</p>
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
                  <strong>{formatDateTime(booking.start_at)} - {formatDateTime(booking.end_at).split(" ").pop()}</strong>
                  <p className="small">상태: {booking.status}</p>
                  {booking.status === "booked" && <button className="danger" onClick={() => cancel(booking.id)}>취소 요청하기</button>}
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>예약 가능한 시간</h2>
            <div className="list">
              {slots.length === 0 && <p>현재 예약 가능한 시간이 없습니다.</p>}
              {slots.map((slot) => (
                <div className="item row" key={slot.id}>
                  <div>
                    <strong>{formatDateTime(slot.start_at)}</strong>
                    <p className="small">종료: {formatDateTime(slot.end_at)}</p>
                  </div>
                  <button onClick={() => book(slot.id)}>예약하기</button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
