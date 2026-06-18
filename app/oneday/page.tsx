"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type OneDayClass = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  capacity: number;
  regular_price?: number;
  normal_price?: number;
  description?: string;
  remaining: number;
};

type OneDayBooking = {
  id: string;
  people_count?: number;
  is_regular_student?: boolean;
  status?: string;
  created_at?: string;
  oneday_classes?: {
    id: string;
    title: string;
    start_at: string;
    end_at: string;
    regular_price?: number;
    normal_price?: number;
    description?: string;
  } | null;
};

const ACTIVE_STATUSES = new Set(["booked", "입금대기", "입금완료"]);
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

const STATUS_LABELS: Record<string, string> = {
  booked: "신청 완료",
  cancelled: "취소 완료",
  "입금대기": "입금 대기",
  "입금완료": "입금 완료",
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

function formatPrice(value?: number) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

function statusLabel(status?: string) {
  if (!status) return "-";
  return STATUS_LABELS[status] || status;
}

export default function OneDayPage() {
  const [classes, setClasses] = useState<OneDayClass[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [name, setName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [peopleCount, setPeopleCount] = useState(1);
  const [message, setMessage] = useState("");

  const [lookupName, setLookupName] = useState("");
  const [lookupPhoneLast4, setLookupPhoneLast4] = useState("");
  const [myBookings, setMyBookings] = useState<OneDayBooking[]>([]);
  const [lookupMessage, setLookupMessage] = useState("");
  const [lookupDone, setLookupDone] = useState(false);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  async function loadClasses() {
    const res = await fetch("/api/oneday", { cache: "no-store" });
    const json = await res.json();
    setClasses(json.classes || []);
  }

  useEffect(() => {
    loadClasses();
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadMyBookings(customName?: string, customPhone?: string) {
    const targetName = String(customName ?? lookupName).trim();
    const targetPhone = String(customPhone ?? lookupPhoneLast4).trim();
    setLookupMessage("");
    setLookupDone(false);

    if (!targetName || !/^\d{4}$/.test(targetPhone)) {
      setLookupMessage("이름과 핸드폰번호 뒷자리 4자리를 정확히 입력해 주세요.");
      return;
    }

    setLoadingBookings(true);
    const query = new URLSearchParams({ name: targetName, phoneLast4: targetPhone });
    const res = await fetch(`/api/oneday/bookings?${query.toString()}`, { cache: "no-store" });
    const json = await res.json();
    setLoadingBookings(false);

    if (!res.ok) {
      setLookupMessage(json.message || "신청 내역을 불러올 수 없습니다.");
      return;
    }

    setLookupName(targetName);
    setLookupPhoneLast4(targetPhone);
    setMyBookings(json.bookings || []);
    setLookupDone(true);
    setCurrentTime(Date.now());
  }

  async function reserve() {
    setMessage("");
    const submittedName = name.trim();
    const submittedPhone = phoneLast4.trim();
    const res = await fetch("/api/oneday", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId: selected,
        student_name: submittedName,
        phone_last4: submittedPhone,
        people_count: peopleCount,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "신청할 수 없습니다.");
      return;
    }
    setMessage("원데이 클래스 신청이 완료되었습니다.");
    setSelected("");
    setPeopleCount(1);
    setLookupName(submittedName);
    setLookupPhoneLast4(submittedPhone);
    await Promise.all([loadClasses(), loadMyBookings(submittedName, submittedPhone)]);
  }

  async function cancelBooking(booking: OneDayBooking) {
    const oneClass = booking.oneday_classes;
    if (!oneClass) return;

    const confirmed = window.confirm(
      `${oneClass.title} 신청을 취소할까요?\n원데이 클래스는 수업 시작 6시간 전까지만 취소할 수 있습니다.`,
    );
    if (!confirmed) return;

    setCancellingId(booking.id);
    setLookupMessage("");
    const res = await fetch("/api/oneday/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: booking.id,
        student_name: lookupName,
        phone_last4: lookupPhoneLast4,
      }),
    });
    const json = await res.json();
    setCancellingId(null);

    if (!res.ok) {
      setLookupMessage(json.message || "취소할 수 없습니다.");
      return;
    }

    setLookupMessage(json.message || "원데이 클래스 신청이 취소되었습니다.");
    await Promise.all([loadMyBookings(), loadClasses()]);
  }

  return (
    <main className="container">
      <Link href="/" className="small">← 처음으로</Link>
      <section className="card">
        <h1>원데이 클래스 예약</h1>
        <p>개설된 원데이 클래스를 선택해 신청할 수 있습니다. 각 클래스의 제목, 커리큘럼, 수업 일정, 비용을 확인한 뒤 신청해 주세요.</p>
        <p className="small">문장학교에 등록된 정규 수강생 전용 예약 메뉴입니다.</p>
        <p className="small">신청 취소는 수업 시작 6시간 전까지만 가능합니다.</p>
        {message && <p className={message.includes("완료") ? "success" : "error"}>{message}</p>}
      </section>

      <section className="card">
        <h2>개설 클래스</h2>
        <div className="list">
          {classes.length === 0 && <p>현재 신청 가능한 원데이 클래스가 없습니다.</p>}
          {classes.map((c) => (
            <div className="item" key={c.id}>
              <strong>{c.title}</strong>
              <p>{formatDateTime(c.start_at)} - {formatTime(c.end_at)}</p>
              <p className="small">남은 자리: {Math.max(0, c.remaining)}명 / 정원: 5명</p>
              <p className="small">비용: {formatPrice(c.regular_price)}</p>
              {c.description && <p>커리큘럼: {c.description}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>신청하기</h2>
        <label>신청할 클래스</label>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">선택해 주세요</option>
          {classes.filter((c) => c.remaining > 0).map((c) => <option value={c.id} key={c.id}>{c.title}</option>)}
        </select>
        <label>이름</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <label>핸드폰번호 뒷자리 4자리</label>
        <input value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" maxLength={4} />
        <label>참여 인원</label>
        <input type="number" min={1} max={5} value={peopleCount} onChange={(e) => setPeopleCount(Number(e.target.value))} />
        <button onClick={reserve}>신청하기</button>
      </section>

      <section className="card">
        <h2>내 신청 내역 및 취소</h2>
        <p>신청할 때 입력한 이름과 핸드폰번호 뒷자리로 내역을 확인하고 취소할 수 있습니다.</p>
        <label>이름</label>
        <input value={lookupName} onChange={(e) => setLookupName(e.target.value)} />
        <label>핸드폰번호 뒷자리 4자리</label>
        <input
          value={lookupPhoneLast4}
          onChange={(e) => setLookupPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          maxLength={4}
        />
        <button onClick={() => loadMyBookings()} disabled={loadingBookings}>
          {loadingBookings ? "확인 중..." : "신청 내역 확인하기"}
        </button>

        {lookupMessage && (
          <p className={lookupMessage.includes("취소되었습니다") ? "success" : "error"}>{lookupMessage}</p>
        )}

        {lookupDone && (
          <div className="list onedayBookingList">
            {myBookings.length === 0 && <p>확인되는 원데이 클래스 신청 내역이 없습니다.</p>}
            {myBookings.map((booking) => {
              const oneClass = booking.oneday_classes;
              const status = String(booking.status || "");
              const isActive = ACTIVE_STATUSES.has(status);
              const startTime = oneClass?.start_at ? new Date(oneClass.start_at).getTime() : 0;
              const isBeforeStart = startTime > currentTime;
              const isBeforeCancelDeadline = startTime - currentTime >= SIX_HOURS_MS;
              const canCancel = Boolean(oneClass && isActive && isBeforeStart && isBeforeCancelDeadline);
              const price = oneClass?.regular_price;

              return (
                <div className="item bookingItem" key={booking.id}>
                  <div>
                    <strong>{oneClass?.title || "원데이 클래스"}</strong>
                    {oneClass ? (
                      <>
                        <p>{formatDateTime(oneClass.start_at)} - {formatTime(oneClass.end_at)}</p>
                        <p className="small">신청 인원: {booking.people_count || 1}명 / 상태: {statusLabel(status)}</p>
                        <p className="small">비용: {formatPrice(price)}</p>
                      </>
                    ) : (
                      <p className="small">삭제되었거나 확인할 수 없는 클래스입니다.</p>
                    )}
                    {isActive && isBeforeStart && !isBeforeCancelDeadline && (
                      <p className="small error">수업 시작 6시간 이내라 온라인 취소가 마감되었습니다.</p>
                    )}
                    {isActive && !isBeforeStart && (
                      <p className="small">이미 시작했거나 종료된 클래스입니다.</p>
                    )}
                  </div>
                  {canCancel && (
                    <button
                      className="danger"
                      onClick={() => cancelBooking(booking)}
                      disabled={cancellingId === booking.id}
                    >
                      {cancellingId === booking.id ? "취소 중..." : "신청 취소하기"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
