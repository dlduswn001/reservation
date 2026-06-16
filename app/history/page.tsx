"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Student = { id: string; name: string; phone_last4: string; lesson_credits?: number };
type Booking = { id: string; start_at: string; end_at: string; status: string; memo?: string; created_at?: string };
type ManualHistory = { id: string; lesson_date: string; title: string; memo?: string; created_at?: string };
type OneDayClassInfo = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  regular_price?: number;
  normal_price?: number;
  description?: string;
};
type OneDayBooking = {
  id: string;
  people_count?: number;
  is_regular_student?: boolean;
  status?: string;
  created_at?: string;
  oneday_classes?: OneDayClassInfo | null;
};

const STATUS_LABELS: Record<string, string> = {
  booked: "예약 완료",
  cancelled: "취소 완료",
  late_cancelled: "6시간 이내 취소",
  done: "수업 완료",
  change_request: "변경 요청",
  cancel_request: "취소 요청",
  "입금대기": "입금 대기",
  "입금완료": "입금 완료",
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

function formatPrice(value?: number) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

function statusLabel(booking: Booking) {
  const startTime = new Date(booking.start_at).getTime();
  if (booking.status === "booked" && startTime < Date.now()) {
    return "지난 수업";
  }
  return STATUS_LABELS[booking.status] || booking.status;
}

function onedayStatusLabel(status?: string) {
  if (!status) return "-";
  return STATUS_LABELS[status] || status;
}

export default function HistoryPage() {
  const [name, setName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [manualHistory, setManualHistory] = useState<ManualHistory[]>([]);
  const [onedayBookings, setOnedayBookings] = useState<OneDayBooking[]>([]);
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
    setManualHistory(historyJson.manualHistory || []);
    setOnedayBookings(historyJson.onedayBookings || []);
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
        <p>이름과 핸드폰번호 뒷자리 4자리를 입력하면, 정규수업과 원데이 클래스 신청 기록을 함께 확인할 수 있습니다.</p>
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
            <button className="secondary" onClick={() => {
              setStudent(null);
              setBookings([]);
              setManualHistory([]);
              setOnedayBookings([]);
              setName("");
              setPhoneLast4("");
            }}>다른 수강생으로 확인하기</button>
          </section>

          <section className="card">
            <h2>다가오는 정규수업</h2>
            <div className="list">
              {upcomingBookings.length === 0 && <p>다가오는 정규수업 예약이 없습니다.</p>}
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
            <h2>원데이 클래스 신청 기록</h2>
            <div className="list">
              {onedayBookings.length === 0 && <p>원데이 클래스 신청 기록이 없습니다.</p>}
              {onedayBookings.map((booking) => {
                const oneClass = booking.oneday_classes;
                if (!oneClass) {
                  return (
                    <div className="item" key={booking.id}>
                      <strong>삭제되었거나 확인할 수 없는 원데이 클래스</strong>
                      <p className="small">신청 상태: {onedayStatusLabel(booking.status)}</p>
                    </div>
                  );
                }
                const price = booking.is_regular_student ? oneClass.regular_price : oneClass.normal_price;
                return (
                  <div className="item" key={booking.id}>
                    <strong>{oneClass.title}</strong>
                    <p>{formatDateTime(oneClass.start_at)} - {formatTime(oneClass.end_at)}</p>
                    <p className="small">신청 인원: {booking.people_count || 1}명 / 상태: {onedayStatusLabel(booking.status)}</p>
                    <p className="small">적용 비용: {formatPrice(price)} ({booking.is_regular_student ? "정규수강생" : "일반"})</p>
                    {oneClass.description && <p>커리큘럼: {oneClass.description}</p>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <h2>관리자가 등록한 과거 수강 기록</h2>
            <div className="list">
              {manualHistory.length === 0 && <p>관리자가 등록한 과거 수강 기록이 없습니다.</p>}
              {manualHistory.map((history) => (
                <div className="item" key={history.id}>
                  <strong>{history.title}</strong>
                  <p className="small">{formatDateTime(history.lesson_date)}</p>
                  {history.memo && <p>{history.memo}</p>}
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>지난 정규수업 및 취소 기록</h2>
            <div className="list">
              {pastBookings.length === 0 && <p>아직 지난 정규수업 기록이 없습니다.</p>}
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
