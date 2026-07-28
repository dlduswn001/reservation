"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BottomNav from "../components/BottomNav";

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
  amount_due?: number | null;
  created_at?: string;
  oneday_classes?: OneDayClassInfo | null;
};

type UpcomingItem =
  | { kind: "regular"; date: string; booking: Booking }
  | { kind: "oneday"; date: string; booking: OneDayBooking; oneClass: OneDayClassInfo };

type HistoryItem =
  | { kind: "regular"; date: string; booking: Booking }
  | { kind: "manual"; date: string; history: ManualHistory }
  | { kind: "oneday"; date: string; booking: OneDayBooking; oneClass: OneDayClassInfo | null };

const STUDENT_LOGIN_STORAGE_KEY = "munjangStudentLogin";

const STATUS_LABELS: Record<string, string> = {
  booked: "예약 완료",
  cancelled: "취소 완료",
  late_cancelled: "3시간 이내 취소",
  done: "수강 완료",
  change_request: "변경 요청",
  cancel_request: "취소 요청",
  "입금대기": "입금 대기",
  "등록대기": "무료 등록 대기",
  "입금완료": "등록 완료",
  "등록완료": "등록 완료",
};

const ACTIVE_ONEDAY_STATUSES = new Set(["booked", "입금대기", "등록대기", "입금완료", "등록완료"]);
const REGULAR_HISTORY_STATUSES = new Set(["done", "cancelled", "late_cancelled"]);

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
    // 저장하지 못해도 기록 확인 기능은 그대로 사용할 수 있습니다.
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

function formatPrice(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

function formatOneDayAmount(value?: number | null) {
  if (value === 0) return "무료";
  return formatPrice(value ?? 10000);
}

function regularStatusLabel(booking: Booking, now: number) {
  const startTime = new Date(booking.start_at).getTime();
  const endTime = new Date(booking.end_at).getTime();

  if (booking.status === "booked" && startTime <= now && endTime > now) {
    return "수업 진행 중";
  }
  if (["booked", "change_request"].includes(booking.status) && endTime <= now) {
    return "수강 완료";
  }
  return STATUS_LABELS[booking.status] || booking.status;
}

function onedayStatusLabel(status?: string) {
  if (!status) return "-";
  return STATUS_LABELS[status] || status;
}

function mergeMemo(source: string, memo?: string) {
  const cleaned = String(memo || "").trim();
  return cleaned ? `${source} · ${cleaned}` : source;
}

export default function HistoryPage() {
  const [name, setName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [rememberLogin, setRememberLogin] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [manualHistory, setManualHistory] = useState<ManualHistory[]>([]);
  const [onedayBookings, setOnedayBookings] = useState<OneDayBooking[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const saved = readStoredStudentLogin();
    if (saved) {
      setName(saved.name);
      setPhoneLast4(saved.phone_last4);
      setRememberLogin(true);
      loginAndLoad(saved.name, saved.phone_last4, true);
    }
  }, []);

  async function loginAndLoad(customName?: string, customPhoneLast4?: string, shouldRemember = rememberLogin) {
    const loginName = String(customName ?? name).trim();
    const loginPhoneLast4 = String(customPhoneLast4 ?? phoneLast4).trim();
    setMessage("");

    if (!loginName || !/^\d{4}$/.test(loginPhoneLast4)) {
      setMessage("이름과 핸드폰번호 뒷자리 4자리를 정확히 입력해 주세요.");
      return;
    }

    setLoading(true);
    const loginRes = await fetch("/api/student/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: loginName, phone_last4: loginPhoneLast4 }),
    });
    const loginJson = await loginRes.json();
    if (!loginRes.ok) {
      setLoading(false);
      setMessage(loginJson.message || "수강생 정보를 찾을 수 없습니다.");
      return;
    }

    setStudent(loginJson.student);
    setName(loginJson.student.name);
    setPhoneLast4(loginJson.student.phone_last4);
    if (shouldRemember) {
      saveStoredStudentLogin(loginJson.student);
    } else {
      clearStoredStudentLogin();
    }
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
    setCurrentTime(Date.now());
  }

  const upcomingItems = useMemo<UpcomingItem[]>(() => {
    const regularItems: UpcomingItem[] = bookings
      .filter((booking) => booking.status === "booked" && new Date(booking.end_at).getTime() > currentTime)
      .map((booking) => ({ kind: "regular", date: booking.start_at, booking }));

    const oneDayItems: UpcomingItem[] = onedayBookings
      .filter((booking) => {
        const oneClass = booking.oneday_classes;
        return Boolean(
          oneClass
          && ACTIVE_ONEDAY_STATUSES.has(String(booking.status || ""))
          && new Date(oneClass.end_at).getTime() > currentTime
        );
      })
      .map((booking) => ({
        kind: "oneday",
        date: booking.oneday_classes!.start_at,
        booking,
        oneClass: booking.oneday_classes!,
      }));

    return [...regularItems, ...oneDayItems]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [bookings, onedayBookings, currentTime]);

  const historyItems = useMemo<HistoryItem[]>(() => {
    const regularItems: HistoryItem[] = bookings
      .filter((booking) => {
        const lessonEnded = new Date(booking.end_at).getTime() <= currentTime;
        return REGULAR_HISTORY_STATUSES.has(booking.status) || lessonEnded;
      })
      .map((booking) => ({ kind: "regular", date: booking.start_at, booking }));

    const manualItems: HistoryItem[] = manualHistory.map((history) => ({
      kind: "manual",
      date: history.lesson_date,
      history,
    }));

    const oneDayItems: HistoryItem[] = onedayBookings
      .filter((booking) => {
        const oneClass = booking.oneday_classes;
        if (!oneClass) return false;
        const lessonEnded = new Date(oneClass.end_at).getTime() <= currentTime;
        const isActive = ACTIVE_ONEDAY_STATUSES.has(String(booking.status || ""));
        return lessonEnded && isActive;
      })
      .map((booking) => ({
        kind: "oneday",
        date: booking.oneday_classes?.start_at || booking.created_at || new Date(0).toISOString(),
        booking,
        oneClass: booking.oneday_classes || null,
      }));

    return [...regularItems, ...manualItems, ...oneDayItems]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [bookings, manualHistory, onedayBookings, currentTime]);

  function resetStudent() {
    clearStoredStudentLogin();
    setStudent(null);
    setBookings([]);
    setManualHistory([]);
    setOnedayBookings([]);
    setName("");
    setPhoneLast4("");
    setMessage("");
  }

  return (
    <main className="container appContainer">
      <section className="card">
        <h1>내 수강 기록</h1>
        <p>이름과 핸드폰번호 뒷자리 4자리를 입력하면, 앞으로 예정된 수업과 지난 수강 기록을 한 번에 확인할 수 있습니다.</p>
        {!student && (
          <div>
            <label>이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김문장" />
            <label>핸드폰번호 뒷자리 4자리</label>
            <input value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="예: 6789" inputMode="numeric" maxLength={4} />
            <label className="checkboxRow">
              <input type="checkbox" checked={rememberLogin} onChange={(e) => setRememberLogin(e.target.checked)} />
              <span>이 기기에서 자동 로그인하기</span>
            </label>
            <button onClick={() => loginAndLoad()} disabled={loading}>{loading ? "확인 중..." : "수강 기록 확인하기"}</button>
          </div>
        )}
        {message && <p className="error">{message}</p>}
      </section>

      {student && (
        <>
          <section className="card">
            <h2>{student.name}님의 수강 정보</h2>
            <p>잔여 수강권: <strong>{student.lesson_credits ?? 0}회</strong></p>
            <button className="secondary" onClick={resetStudent}>로그아웃 / 다른 수강생으로 확인하기</button>
          </section>

          <section className="card">
            <h2>다가오는 수업</h2>
            <p className="small">예약이 완료된 정규수업과 신청이 유효한 원데이 클래스만 표시됩니다.</p>
            <div className="list">
              {upcomingItems.length === 0 && <p>현재 다가오는 수업이 없습니다.</p>}
              {upcomingItems.map((item) => {
                if (item.kind === "regular") {
                  return (
                    <div className="item" key={`regular-${item.booking.id}`}>
                      <strong>정규수업</strong>
                      <p>{formatDateTime(item.booking.start_at)} - {formatTime(item.booking.end_at)}</p>
                      <p className="small">상태: {regularStatusLabel(item.booking, currentTime)}</p>
                      <p className="small">메모: {mergeMemo("수강생 직접 예약", item.booking.memo)}</p>
                    </div>
                  );
                }

                const price = item.booking.amount_due ?? item.oneClass.regular_price ?? 10000;
                return (
                  <div className="item" key={`oneday-${item.booking.id}`}>
                    <strong>원데이 클래스 · {item.oneClass.title}</strong>
                    <p>{formatDateTime(item.oneClass.start_at)} - {formatTime(item.oneClass.end_at)}</p>
                    <p className="small">
                      신청 인원: {item.booking.people_count || 1}명 / 상태: {onedayStatusLabel(item.booking.status)}
                    </p>
                    <p className="small">
                      비용: {formatOneDayAmount(price)}
                    </p>
                    <p className="small">메모: 수강생 직접 예약</p>
                    {item.oneClass.description && <p>커리큘럼: {item.oneClass.description}</p>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <h2>수강 기록</h2>
            <p className="small">완료한 수업, 취소 기록, 관리자가 직접 등록한 과거 수업을 날짜순으로 함께 보여드립니다.</p>
            <div className="list">
              {historyItems.length === 0 && <p>아직 등록된 수강 기록이 없습니다.</p>}
              {historyItems.map((item) => {
                if (item.kind === "manual") {
                  return (
                    <div className="item" key={`manual-${item.history.id}`}>
                      <strong>{item.history.title}</strong>
                      <p className="small">{formatDateTime(item.history.lesson_date)}</p>
                      <p className="small">상태: 수강 완료</p>
                      <p className="small">메모: {mergeMemo("관리자 직접 등록", item.history.memo)}</p>
                    </div>
                  );
                }

                if (item.kind === "regular") {
                  return (
                    <div className="item" key={`regular-history-${item.booking.id}`}>
                      <strong>정규수업</strong>
                      <p>{formatDateTime(item.booking.start_at)} - {formatTime(item.booking.end_at)}</p>
                      <p className="small">상태: {regularStatusLabel(item.booking, currentTime)}</p>
                      <p className="small">메모: {mergeMemo("수강생 직접 예약", item.booking.memo)}</p>
                    </div>
                  );
                }

                const oneClass = item.oneClass;
                if (!oneClass) {
                  return (
                    <div className="item" key={`oneday-history-${item.booking.id}`}>
                      <strong>원데이 클래스</strong>
                      <p className="small">삭제되었거나 확인할 수 없는 클래스입니다.</p>
                      <p className="small">상태: {onedayStatusLabel(item.booking.status)}</p>
                      <p className="small">메모: 수강생 직접 예약</p>
                    </div>
                  );
                }

                const price = item.booking.amount_due ?? oneClass.regular_price ?? 10000;
                return (
                  <div className="item" key={`oneday-history-${item.booking.id}`}>
                    <strong>원데이 클래스 · {oneClass.title}</strong>
                    <p>{formatDateTime(oneClass.start_at)} - {formatTime(oneClass.end_at)}</p>
                    <p className="small">
                      신청 인원: {item.booking.people_count || 1}명 / 상태: {onedayStatusLabel(item.booking.status)}
                    </p>
                    <p className="small">
                      비용: {formatOneDayAmount(price)}
                    </p>
                    <p className="small">메모: 수강생 직접 예약</p>
                    {oneClass.description && <p>커리큘럼: {oneClass.description}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
      <BottomNav />
    </main>
  );
}
