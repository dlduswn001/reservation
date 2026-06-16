"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Student = { id: string; name: string; phone_last4: string; lesson_credits?: number };
type Booking = { id: string; start_at: string; end_at: string; status: string; memo?: string; created_at?: string };

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
    year: "numeric",
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

function statusLabel(booking: Booking) {
  const startTime = new Date(booking.start_at).getTime();
  if (booking.status === "booked" && startTime < Date.now()) {
    return "지난 수업";
  }
  return STATUS_LABELS[booking.status] || booking.status;
}

export default function HistoryPage() {
  const [name, setName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loginAndLoad() {
    setMessage("");
    setLoading(true);
    const loginRes = await fetch("/api/student/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone_last4: phoneLast4 }),
    });
    const loginJson = await loginRes.json();
    if (!loginRes.ok) {
      setLoading(false);
      setMessage(loginJson.message || "수강생 정보를 찾을 수 없습니다.");
      return;
    }

    setStudent(loginJson.student);
    const historyRes = await fetch(`/api/student/history?studentId=${loginJson.student.id}`);
    const historyJson = await historyRes.json();
    setLoading(false);
    if (!historyRes.ok) {
      setMessage(historyJson.message || "수강 기록을 불러올 수 없습니다.");
      return;
    }
    setBookings(historyJson.bookings || []);
  }

  const pastBookings = useMemo(() => {
    return bookings.filter((booking) => new Date(booking.start_at).getTime() < Date.now());
  }, [bookings]);

  const upcomingBookings = useMemo(() => {
    return bookings
      .filter((booking) => new Date(booking.start_at).getTime() >= Date.now())
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [bookings]);

  return (
    <main className="container">
      <Link href="/" className="small">← 처음으로</Link>
      <section className="card">
        <h1>내 수강 기록</h1>
        <p>이름과 핸드폰번호 뒷자리 4자리를 입력하면, 지금까지 예약했거나 들었던 정규수업 기록을 확인할 수 있습니다.</p>
        {!student && (
          <div>
            <label>이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김문장" />
            <label>핸드폰번호 뒷자리 4자리</label>
            <input value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value)} placeholder="예: 6789" maxLength={4} />
            <button onClick={loginAndLoad} disabled={loading}>{loading ? "확인 중..." : "수강 기록 확인하기"}</button>
          </div>
        )}
        {message && <p className="error">{message}</p>}
      </section>

      {student && (
        <>
          <section className="card">
            <h2>{student.name}님의 수강 정보</h2>
            <p>잔여 수강권: <strong>{student.lesson_credits ?? 0}회</strong></p>
            <button className="secondary" onClick={() => { setStudent(null); setBookings([]); setName(""); setPhoneLast4(""); }}>다른 수강생으로 확인하기</button>
          </section>

          <section className="card">
            <h2>다가오는 수업</h2>
            <div className="list">
              {upcomingBookings.length === 0 && <p>다가오는 수업 예약이 없습니다.</p>}
              {upcomingBookings.map((booking) => (
                <div className="item" key={booking.id}>
                  <strong>{formatDateTime(booking.start_at)} - {formatTime(booking.end_at)}</strong>
                  <p className="small">상태: {statusLabel(booking)}</p>
                  {booking.memo && <p className="small">메모: {booking.memo}</p>}
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>지난 수업 및 취소 기록</h2>
            <div className="list">
              {pastBookings.length === 0 && <p>아직 지난 수업 기록이 없습니다.</p>}
              {pastBookings.map((booking) => (
                <div className="item" key={booking.id}>
                  <strong>{formatDateTime(booking.start_at)} - {formatTime(booking.end_at)}</strong>
                  <p className="small">상태: {statusLabel(booking)}</p>
                  {booking.memo && <p className="small">메모: {booking.memo}</p>}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
