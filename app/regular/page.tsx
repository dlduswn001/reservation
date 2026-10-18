"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import BottomNav from "../components/BottomNav";
import { disconnectPushOnLogout } from "../../lib/pushClient";

type Student = {
  id: string;
  name: string;
  phone_last4: string;
  lesson_credits?: number;
  lesson_duration_minutes?: number;
  pass_registered_at?: string | null;
  pass_first_lesson_at?: string | null;
  pass_expires_at?: string | null;
  pass_extension_used?: boolean | null;
  pass_extension_until?: string | null;
  pass_extension_reason?: string | null;
};

type Slot = {
  id: string;
  start_at: string;
  end_at: string;
  lesson_minutes?: number;
  break_minutes?: number;
  rule_label?: string;
  credit_cost?: number;
  is_lifestyle?: boolean;
  is_waitlist?: boolean;
  is_closed?: boolean;
  is_dual_noon?: boolean;
  regular_option_status?: "available" | "waitlist" | "closed";
  lifestyle_option_status?: "available" | "waitlist" | "closed";
};

type WaitEntry = {
  id: string;
  slot_id: string;
  position: number;
  available_slots?: { start_at: string; end_at: string } | null;
};

type Booking = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  memo?: string;
};

type AvailableMonth = {
  key: string;
  year: number;
  month: number;
  count: number;
};

type OpenMonth = {
  key: string;
  year: number;
  month: number;
  range_start_at?: string;
  range_end_at?: string;
  mode?: string;
};

const STUDENT_LOGIN_STORAGE_KEY = "munjangStudentLogin";
const SLOT_CACHE_STORAGE_KEY = "munjangRegularSlotCacheV37";

const STATUS_LABELS: Record<string, string> = {
  booked: "예약 완료",
  change_request: "변경 요청",
  cancel_request: "취소 요청",
  cancelled: "취소 완료",
  done: "수강 완료",
  in_progress: "수업 진행 중",
  late_cancelled: "3시간 이내 취소",
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

function estimateOpenMonthKey() {
  // 예약은 3시간 전까지만 가능하고, 월말에는 다음 달 스케줄이 먼저 열릴 수 있습니다.
  const cutoffLikeServer = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(cutoffLikeServer);
  const year = Number(parts.find((part) => part.type === "year")?.value || "0");
  const month = Number(parts.find((part) => part.type === "month")?.value || "0");
  const day = Number(parts.find((part) => part.type === "day")?.value || "0");
  const estimatedOpenMonth = day >= 25 ? new Date(Date.UTC(year, month, 1)) : new Date(Date.UTC(year, month - 1, 1));
  return `${estimatedOpenMonth.getUTCFullYear()}-${String(estimatedOpenMonth.getUTCMonth() + 1).padStart(2, "0")}`;
}

function slotCacheKey(studentId: string) {
  return `${SLOT_CACHE_STORAGE_KEY}:${studentId}:${estimateOpenMonthKey()}`;
}

function readCachedSlots(_studentId: string) {
  // v19: 이전 달 일정이 화면에 남는 문제를 막기 위해 예약 가능 시간 캐시를 사용하지 않습니다.
  return null;
}

function saveCachedSlots(_studentId: string, _nextSlots: Slot[]) {
  // v19: 예약 가능 시간은 항상 서버에서 최신으로 불러옵니다.
}

function clearCachedSlots(studentId: string) {
  try {
    window.sessionStorage.removeItem(slotCacheKey(studentId));
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith("munjangRegularSlotCache")) {
        window.sessionStorage.removeItem(key);
      }
    }
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

function formatShortDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatMonthTitle(dateKey: string) {
  const [year, month] = dateKey.split("-").map(Number);
  return `${year}년 ${month}월`;
}

export default function RegularPage() {
  const [name, setName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [rememberLogin, setRememberLogin] = useState(true);
  const [student, setStudent] = useState<Student | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [waitlist, setWaitlist] = useState<WaitEntry[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [openMonth, setOpenMonth] = useState<OpenMonth | null>(null);
  const [availableMonths, setAvailableMonths] = useState<AvailableMonth[]>([]);
  const [selectedMonthKey, setSelectedMonthKey] = useState("");
  const [visibleCalendarMonth, setVisibleCalendarMonth] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
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

  async function loadData(studentId: string, options: { useCache?: boolean; monthKey?: string } = {}) {
    const lessonMinutes = student?.lesson_duration_minutes || "";
    const monthKey = options.monthKey || selectedMonthKey;

    clearCachedSlots(studentId);
    setIsLoadingData(true);

    const slotParams = new URLSearchParams({
      studentId,
      lessonMinutes: String(lessonMinutes),
      v: "36",
      _: String(Date.now()),
    });
    const slotRequest = fetch(`/api/slots?${slotParams.toString()}`, { cache: "no-store" })
      .then(async (slotRes) => {
        const slotJson = await slotRes.json();
        if (!slotRes.ok) throw new Error(slotJson.message || "예약 가능한 시간을 불러오지 못했습니다.");
        // One timeline row per real start instant, even if an older API response
        // mixes "+00:00" DB dates with ".000Z" generated closed entries.
        const byStart = new Map<number, Slot>();
        const priority = (slot: Slot) => slot.is_dual_noon ? 4 : slot.is_closed ? 1 : slot.is_waitlist ? 2 : 3;
        for (const slot of [
          ...(slotJson.slots || []),
          ...(slotJson.waitlist_slots || []),
          ...(slotJson.closed_slots || []),
        ] as Slot[]) {
          const start = new Date(slot.start_at).getTime();
          if (!Number.isFinite(start)) continue;
          const previous = byStart.get(start);
          if (!previous || priority(slot) > priority(previous)) byStart.set(start, slot);
        }
        const nextSlots: Slot[] = [...byStart.values()]
          .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
        setSlots(nextSlots);
        setOpenMonth(slotJson.open_month || null);
        setAvailableMonths(Array.isArray(slotJson.available_months) ? slotJson.available_months : []);
        if (slotJson.open_month?.key) setSelectedMonthKey(slotJson.open_month.key);
        saveCachedSlots(studentId, nextSlots);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "예약 가능한 시간을 불러오지 못했습니다.");
      })
      .finally(() => {
        setIsLoadingData(false);
      });

    const bookingRequest = fetch(`/api/student/bookings?studentId=${studentId}&v=36&_=${Date.now()}`, { cache: "no-store" })
      .then(async (bookingRes) => {
        const bookingJson = await bookingRes.json();
        if (!bookingRes.ok) throw new Error(bookingJson.message || "예약 내역을 불러오지 못했습니다.");
        setBookings(bookingJson.bookings || []);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "예약 내역을 불러오지 못했습니다.");
      });

    const waitlistRequest = loadWaitlist(studentId);
    await Promise.allSettled([slotRequest, bookingRequest, waitlistRequest]);
  }

  async function loadWaitlist(studentId: string) {
    const res = await fetch(`/api/regular-waitlist?studentId=${encodeURIComponent(studentId)}`, {cache:"no-store"});
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "대기 내역을 불러오지 못했습니다.");
    setWaitlist(json.waitlist || []);
  }

  async function applyWaitlist(slotId: string, lifestyleClassName?: "정규수업" | "1:1 서평생활" | "1:1 필사생활") {
    if (!student) return;
    setMessage("");
    const res = await fetch("/api/regular-waitlist", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({studentId:student.id,slotId,lifestyleClassName}),
    });
    const json = await res.json();
    setMessage(res.ok ? `대기 ${json.position}번으로 접수되었습니다. 수강권은 아직 차감되지 않습니다.` : json.message || "대기 신청에 실패했습니다.");
    if(res.ok) await loadWaitlist(student.id);
  }

  async function cancelWaitlist(waitId: string) {
    if (!student || !window.confirm("대기 신청을 취소할까요?")) return;
    const res = await fetch("/api/regular-waitlist", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"cancel",studentId:student.id,waitId}),
    });
    const json = await res.json();
    setMessage(res.ok ? "대기 신청이 취소되었습니다." : json.message || "대기 취소에 실패했습니다.");
    if(res.ok) await loadWaitlist(student.id);
  }

  async function changeOpenMonth(monthKey: string) {
    if (!student || monthKey === selectedMonthKey) return;
    setSelectedMonthKey(monthKey);
    setSelectedDate(null);
    setSlots([]);
    await loadData(student.id, { useCache: false, monthKey });
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
    clearCachedSlots("all");
    try {
      window.sessionStorage.clear();
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key))).catch(() => undefined);
      }
    } catch {
      // 캐시 정리 실패는 무시합니다.
    }
    const saved = readStoredStudentLogin();
    if (saved) {
      setName(saved.name);
      setPhoneLast4(saved.phone_last4);
      setRememberLogin(true);
      login(saved.name, saved.phone_last4, true);
    }
  }, []);

  useEffect(() => {
    if (student) loadData(student.id);
  }, [student]);

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

  const availableDateKeys = useMemo(() => {
    return Object.keys(slotsByDate).sort((a, b) => a.localeCompare(b));
  }, [slotsByDate]);

  const dateKeysByMonth = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    for (const dateKey of availableDateKeys) {
      const monthKey = dateKey.slice(0, 7);
      if (!grouped[monthKey]) grouped[monthKey] = [];
      grouped[monthKey].push(dateKey);
    }
    return grouped;
  }, [availableDateKeys]);

  const calendarMonthKeys = useMemo(() => Object.keys(dateKeysByMonth).sort(), [dateKeysByMonth]);
  const currentSeoulMonth = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit",
  }).format(new Date(currentTime));
  const activeCalendarMonth = calendarMonthKeys.includes(visibleCalendarMonth)
    ? visibleCalendarMonth
    : calendarMonthKeys.includes(currentSeoulMonth)
      ? currentSeoulMonth
      : calendarMonthKeys[0] || "";
  const activeMonthIndex = calendarMonthKeys.indexOf(activeCalendarMonth);

  function navigateCalendar(direction: -1 | 1) {
    const nextMonth = calendarMonthKeys[activeMonthIndex + direction];
    if (!nextMonth) return;
    setVisibleCalendarMonth(nextMonth);
    setSelectedDate(dateKeysByMonth[nextMonth]?.[0] || null);
  }

  useEffect(() => {
    if (availableDateKeys.length === 0) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate((current) => {
      if (current && availableDateKeys.includes(current) && current.startsWith(activeCalendarMonth)) return current;
      return dateKeysByMonth[activeCalendarMonth]?.[0] || null;
    });
  }, [availableDateKeys, activeCalendarMonth, dateKeysByMonth]);

  const selectedSlots = selectedDate ? slotsByDate[selectedDate] || [] : [];
  // A started lesson no longer has a live queue, even before the next refresh.
  const visibleWaitlist = waitlist.filter((item) => (
    item.available_slots?.start_at
    && new Date(item.available_slots.start_at).getTime() > currentTime
  ));

  async function book(slot: Slot, lifestyleClassName?: "정규수업" | "1:1 서평생활" | "1:1 필사생활") {
    if (!student) return;
    if (slot.is_lifestyle && !lifestyleClassName) {
      setMessage("1:1 서평생활 또는 1:1 필사생활을 선택해 주세요.");
      return;
    }
    setMessage("");
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: student.id, slotId: slot.id, lifestyleClassName }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "예약할 수 없습니다.");
      return;
    }
    const cost = Number(json.credit_cost ?? slot.credit_cost ?? 1);
    const name = json.class_name || lifestyleClassName || "정규수업";
    setMessage(`예약이 완료되었습니다. ${name} 예약으로 수강권 ${cost}회가 차감되었습니다.`);
    await refreshStudent();
    await loadData(student.id, { useCache: false });
  }

  function logoutStudent() {
    void disconnectPushOnLogout(student);
    clearStoredStudentLogin();
    setStudent(null);
    setName("");
    setPhoneLast4("");
    setSlots([]);
    setBookings([]);
    setWaitlist([]);
    setSelectedDate(null);
    setMessage("자동 로그인 정보를 지웠습니다. 다시 로그인해 주세요.");
  }

  const studentLessonMinutes = Number(student?.lesson_duration_minutes ?? 90);
  const isDirectScheduleStudent = studentLessonMinutes === 120;
  const lifestyleCreditText = studentLessonMinutes === 45 ? "수강권 1회" : "수강권 0.5회";

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
    await loadData(student.id, { useCache: false });
  }

  return (
    <main className="container appContainer studioApp studioRegularPage" style={styles.appContainer}>
      <header className="studioPageHeader"><h1>정규수업 예약</h1></header>
      <section className="card" style={styles.topCardFix}>
        {!student ? (
          <div>
            <p>정규 수강생 전용 예약 페이지입니다. 이름과 핸드폰번호 뒷자리 4자리를 입력해 주세요.</p>
            <label>이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김문장" />
            <label>핸드폰번호 뒷자리 4자리</label>
            <input
              value={phoneLast4}
              onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="예: 6789"
              inputMode="numeric"
              maxLength={4}
            />
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
            <div className="noticeBox reservationNoticeBox" aria-label="정규수업 예약 안내">
              <div className="noticeTitle">정규수업 예약 안내</div>
              <div className="noticeGrid">
                <div className="noticeItem">
                  <span className="noticeIcon">예약</span>
                  <p>수업 신청은 시작 <strong>3시간 전까지</strong> 가능합니다.</p>
                </div>
                <div className="noticeItem">
                  <span className="noticeIcon">취소</span>
                  <p>수업 시작 <strong>3시간 전까지 취소</strong>해야 수강권이 차감되지 않습니다.</p>
                </div>
                <div className="noticeItem">
                  <span className="noticeIcon">기간</span>
                  <p><strong>4회 정규수강권</strong>은 첫 수업일로부터 <strong>10주 동안</strong> 사용할 수 있습니다.</p>
                </div>
                <div className="noticeItem">
                  <span className="noticeIcon">생활</span>
                  <p><strong>1:1 서평생활</strong>과 <strong>1:1 필사생활</strong>은 45분 수업입니다. 45분 수강권은 <strong>1회</strong>, 90분 수강권은 <strong>0.5회</strong>가 차감됩니다.</p>
                </div>
              </div>
              <p className="small" style={{marginTop: 12, marginBottom: 0}}>
                예약 가능한 수업은 <strong>예약하기</strong>, 이미 예약된 수업은 <strong>대기 신청</strong>,
                예약과 대기 신청이 모두 불가능한 시간은 <strong>마감</strong>으로 표시됩니다.
              </p>
            </div>
          </div>
        )}
        {message && <p className={message.includes("완료") || message.includes("접수") ? "success" : "error"}>{message}</p>}
      </section>

      {student && (
        <>
          {visibleWaitlist.length > 0 && (
            <section className="card" style={styles.cardFix}>
              <h2>내 대기 신청</h2>
              {visibleWaitlist.map(item => (
                <div key={item.id} className="item" style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                  <span><strong>{item.available_slots?.start_at ? formatDateTime(item.available_slots.start_at) : "수업 시간"}</strong> · 대기 {item.position}번</span>
                  <button className="secondary compact" onClick={()=>cancelWaitlist(item.id)}>대기 취소</button>
                </div>
              ))}
              <p className="small">대기는 예약 확정이 아닙니다. 대기 신청 시 수강권은 차감되지 않습니다.</p>
            </section>
          )}
          <section className="card" style={styles.cardFix}>
            <h2>내 수업 일정</h2>
            <div className="bookingSectionTabs" role="tablist" aria-label="수업 일정 구분" style={styles.bookingSectionTabs}>
              <button
                type="button"
                className={`bookingSectionTab ${bookingSection === "upcoming" ? "active" : ""}`}
                onClick={() => setBookingSection("upcoming")}
                role="tab"
                aria-selected={bookingSection === "upcoming"}
                style={bookingSection === "upcoming" ? styles.activeTab : styles.tab}
              >
                예정된 수업 <span>{upcomingBookings.length}</span>
              </button>
              <button
                type="button"
                className={`bookingSectionTab ${bookingSection === "completed" ? "active" : ""}`}
                onClick={() => setBookingSection("completed")}
                role="tab"
                aria-selected={bookingSection === "completed"}
                style={bookingSection === "completed" ? styles.activeTab : styles.tab}
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

          {isDirectScheduleStudent ? (
            <section className="card" style={styles.cardFix}>
              <h2>120분 수업 예약 안내</h2>
              <div className="noticeBox reservationNoticeBox" aria-label="120분 수업 직접 조율 안내">
                <div className="noticeTitle">120분 수업은 직접 일정을 조율합니다</div>
                <p style={styles.helperText}>120분 수업은 충분한 수업 시간을 확보하기 위해 선생님과 직접 일정을 조율하고 있어요. 희망 요일과 시간을 보내주시면 가능한 시간을 확인해 안내드릴게요.</p>
                <p style={styles.helperText}>관리자가 배정한 수업은 위의 <strong>내 수업 일정</strong>과 하단 <strong>예약내역</strong>에서 확인할 수 있습니다.</p>
                <a className="button" href="http://pf.kakao.com/_xcxbGwn/chat" target="_blank" rel="noopener noreferrer" style={styles.kakaoButton}>문장학교 카카오톡으로 일정 문의하기</a>
              </div>
            </section>
          ) : (
          <section className="card" style={styles.cardFix}>
            <div style={styles.reservationHeader}>
              <div>
                <h2 style={styles.reservationTitle}>예약 가능한 날짜</h2>
                <p style={styles.helperText}>표시되지 않는 일정은 예약 마감된 일정입니다.</p>
              </div>
              <button
                className="secondary compact"
                type="button"
                onClick={() => student && loadData(student.id, { useCache: false, monthKey: selectedMonthKey })}
                disabled={isLoadingData}
                style={styles.refreshButton}
              >
                {isLoadingData ? "불러오는 중" : "새로고침"}
              </button>
            </div>

            {isLoadingData && slots.length === 0 && <p>예약 가능한 시간을 불러오고 있습니다.</p>}
            {isLoadingData && slots.length > 0 && <p style={styles.helperText}>최신 예약 가능 시간을 확인하고 있습니다.</p>}

            {!isLoadingData && availableDateKeys.length === 0 && (
              <div className="item" style={styles.emptyItem}>
                <strong>현재 예약 가능한 시간이 없습니다.</strong>
                <p className="small">이미 예약된 시간과 3시간 이내 수업은 자동으로 보이지 않습니다.</p>
              </div>
            )}

            {!isLoadingData && availableDateKeys.length > 0 && (
              <>
                <nav aria-label="예약 달력 월 이동" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                  <button className="secondary compact" type="button"
                    aria-label="이전 달 일정"
                    disabled={activeMonthIndex <= 0}
                    onClick={() => navigateCalendar(-1)}
                    style={{ minWidth: 42, fontSize: 20, padding: "6px 10px" }}>‹</button>
                  <strong style={{ fontSize: 17 }}>{activeCalendarMonth && formatMonthTitle(`${activeCalendarMonth}-01`)}</strong>
                  <button className="secondary compact" type="button"
                    aria-label="다음 달 일정"
                    disabled={activeMonthIndex < 0 || activeMonthIndex >= calendarMonthKeys.length - 1}
                    onClick={() => navigateCalendar(1)}
                    style={{ minWidth: 42, fontSize: 20, padding: "6px 10px" }}>›</button>
                </nav>
                <div style={styles.monthList}>
                  {Object.entries(dateKeysByMonth).filter(([monthKey]) => monthKey === activeCalendarMonth).map(([monthKey, dateKeys]) => {
                    const [year, month] = monthKey.split("-").map(Number);
                    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
                    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
                    return (
                      <div key={monthKey} className="studioMonthBlock">
                        <h3 className="studioMonthTitle">{formatMonthTitle(`${monthKey}-01`)}</h3>
                        <div className="studioCalendarWeekdays">
                          {["일", "월", "화", "수", "목", "금", "토"].map((weekday) => <span key={weekday}>{weekday}</span>)}
                        </div>
                        <div className="studioCalendarDates">
                          {Array.from({ length: firstWeekday }, (_, i) => <span key={`blank-${i}`} aria-hidden="true" />)}
                          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                            const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
                            const available = dateKeys.includes(dateKey);
                            const daySlots = slotsByDate[dateKey] || [];
                            const hasBookable = daySlots.some((item) => !item.is_waitlist && !item.is_closed);
                            const hasWaitlist = daySlots.some((item) => item.is_waitlist);
                            const dayStatus = !available ? "예약 불가" : hasBookable ? "예약 가능" : hasWaitlist ? "대기 가능" : "마감";
                            const selected = selectedDate === dateKey;
                            return (
                              <button
                                key={dateKey}
                                type="button"
                                className={`studioCalendarDate ${selected ? "selected" : ""} ${available ? "available" : ""}`}
                                disabled={!available}
                                aria-label={`${dateKey} ${dayStatus}`}
                                title={dayStatus}
                                aria-pressed={selected}
                                onClick={() => setSelectedDate(dateKey)}
                              >
                                {day}
                                {available && !selected && (hasBookable || hasWaitlist) && <span className="studioCalendarDot" aria-hidden="true" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="selectedSlots" style={styles.selectedSlots}>
                  <h3 style={styles.selectedDateTitle}>{selectedDate ? formatDateLabel(selectedDate) : "예약 가능한 시간"}</h3>
                  {(student.lesson_credits ?? 0) <= 0 && <p className="error">잔여 수강권이 없어 예약할 수 없습니다. 관리자에게 문의해 주세요.</p>}
                  {selectedSlots.length === 0 && <p>선택한 날짜에는 예약하거나 대기할 수 있는 수업이 없습니다.</p>}
                  <div style={styles.timelineList} aria-label="선택 날짜 수업 시간표">
                    {selectedSlots.map((slot, index) => (
                      <div key={slot.id} style={styles.timelineRow}>
                        <div style={styles.timelineRail} aria-hidden="true">
                          <span style={styles.timelineDot} />
                          {index < selectedSlots.length - 1 && <span style={styles.timelineLine} />}
                        </div>
                        <div style={styles.timelineContent}>
                          <div style={styles.timelineTopLine}>
                            <strong style={styles.timelineTime}>{slot.is_dual_noon ? `${formatTime(slot.start_at)} 시작` : `${formatTime(slot.start_at)} – ${formatTime(slot.end_at)}`}</strong>
                            <span style={slot.is_closed ? styles.timelineClosedLabel : styles.timelineDuration}>
                              {slot.is_dual_noon ? "정규수업 · 생활수업 선택" : slot.is_closed ? "마감" : slot.is_waitlist ? "예약 마감 · 대기 가능" : slot.is_lifestyle ? "45분" : `${slot.lesson_minutes || 90}분`}
                            </span>
                          </div>
                          <p style={styles.timelineDescription}>
                            {slot.rule_label || (slot.is_lifestyle
                              ? `1:1 서평생활 / 필사생활 · ${lifestyleCreditText} 차감`
                              : "1:1 정규수업 · 수강권 1회 차감")}
                          </p>
                          {slot.is_dual_noon ? (
                            <div style={styles.timelineActions}>
                              {visibleWaitlist.find((item) => item.slot_id === slot.id) ? (
                                <>
                                  <strong style={{fontSize:13,color:"#79283E"}}>
                                    대기 {visibleWaitlist.find((item)=>item.slot_id===slot.id)?.position}번
                                  </strong>
                                  <button type="button" className="secondary compact"
                                    onClick={() => cancelWaitlist(visibleWaitlist.find((item)=>item.slot_id===slot.id)!.id)}>대기 취소</button>
                                </>
                              ) : (
                                <>
                                  {([
                                    {label:"정규수업",choice:"정규수업",state:slot.regular_option_status,cost:1},
                                    {label:"서평생활",choice:"1:1 서평생활",state:slot.lifestyle_option_status,cost:studentLessonMinutes===45?1:0.5},
                                    {label:"필사생활",choice:"1:1 필사생활",state:slot.lifestyle_option_status,cost:studentLessonMinutes===45?1:0.5},
                                  ] as const).map((option) => option.state === "closed" ? (
                                    <span key={option.choice} style={styles.timelineClosedButton}>{option.label} 마감</span>
                                  ) : (
                                    <button key={option.choice} type="button" style={styles.timelineSecondaryButton}
                                      disabled={option.state === "available" && (student.lesson_credits ?? 0) < option.cost}
                                      onClick={() => option.state === "waitlist"
                                        ? applyWaitlist(slot.id,option.choice)
                                        : book(slot,option.choice)}>
                                      {option.label} {option.state === "waitlist" ? "대기 신청" : "신청"}
                                    </button>
                                  ))}
                                </>
                              )}
                            </div>
                          ) : slot.is_closed ? (
                            <div style={styles.timelineActions}>
                              <span style={styles.timelineClosedButton} aria-label="예약 및 대기 신청 마감">마감</span>
                            </div>
                          ) : slot.is_waitlist ? (
                            <div style={styles.timelineActions}>
                              {visibleWaitlist.find((item) => item.slot_id === slot.id) ? (
                                <>
                                  <strong style={{fontSize:13,color:"#79283E"}}>대기 {visibleWaitlist.find((item)=>item.slot_id===slot.id)?.position}번</strong>
                                  <button type="button" className="secondary compact"
                                    onClick={() => cancelWaitlist(visibleWaitlist.find((item)=>item.slot_id===slot.id)!.id)}>대기 취소</button>
                                </>
                              ) : (
                                slot.is_lifestyle ? (
                                  <>
                                    <button type="button" style={styles.timelineSecondaryButton}
                                      onClick={() => applyWaitlist(slot.id,"1:1 서평생활")}>서평생활 대기</button>
                                    <button type="button" style={styles.timelineSecondaryButton}
                                      onClick={() => applyWaitlist(slot.id,"1:1 필사생활")}>필사생활 대기</button>
                                  </>
                                ) : (
                                  <button type="button" style={styles.timelineSecondaryButton}
                                    onClick={() => applyWaitlist(slot.id)}>대기 신청하기</button>
                                )
                              )}
                            </div>
                          ) : slot.is_lifestyle ? (
                            <div style={styles.timelineActions}>
                              <button type="button" onClick={() => book(slot, "1:1 서평생활")}
                                disabled={(student.lesson_credits ?? 0) < Number(slot.credit_cost ?? 0.5)}
                                style={styles.timelineSecondaryButton}>서평생활 신청</button>
                              <button type="button" onClick={() => book(slot, "1:1 필사생활")}
                                disabled={(student.lesson_credits ?? 0) < Number(slot.credit_cost ?? 0.5)}
                                style={styles.timelineSecondaryButton}>필사생활 신청</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => book(slot)}
                              disabled={(student.lesson_credits ?? 0) < 1}
                              style={styles.timelinePrimaryButton}>예약하기 <span aria-hidden="true">→</span></button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
          )}
        </>
      )}
      <BottomNav />
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  appContainer: {
    width: "100%",
    maxWidth: 860,
    overflowX: "hidden",
    paddingLeft: 16,
    paddingRight: 16,
    paddingBottom: 110,
  },
  topCardFix: {
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  cardFix: {
    width: "100%",
    maxWidth: "100%",
    overflow: "hidden",
  },
  bookingSectionTabs: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 14,
  },
  tab: {
    marginTop: 0,
    width: "100%",
    minWidth: 0,
    borderRadius: 999,
    padding: "11px 10px",
    background: "#F3E4E8",
    color: "#541B2B",
    fontSize: 14,
  },
  activeTab: {
    marginTop: 0,
    width: "100%",
    minWidth: 0,
    borderRadius: 999,
    padding: "11px 10px",
    background: "#7A2638",
    color: "#ffffff",
    fontSize: 14,
  },
  reservationHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  reservationTitle: {
    marginBottom: 4,
  },
  helperText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.55,
  },
  refreshButton: {
    flexShrink: 0,
    marginTop: 0,
    whiteSpace: "nowrap",
  },
  kakaoButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    textDecoration: "none",
  },
  emptyItem: {
    marginTop: 8,
  },
  monthList: {
    display: "grid",
    gap: 18,
  },
  monthBlock: {
    display: "grid",
    gap: 10,
  },
  monthTitle: {
    margin: "2px 0 0",
    fontSize: 18,
  },
  datePillGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(126px, 1fr))",
    gap: 9,
    width: "100%",
  },
  datePill: {
    width: "100%",
    minWidth: 0,
    marginTop: 0,
    padding: "12px 10px",
    borderRadius: 16,
    border: "1px solid #ead8dc",
    background: "#fffdfb",
    color: "#541B2B",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
  },
  selectedDatePill: {
    width: "100%",
    minWidth: 0,
    marginTop: 0,
    padding: "12px 10px",
    borderRadius: 16,
    border: "1px solid #7A2638",
    background: "#7A2638",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
  },
  datePillDate: {
    fontSize: 15,
    fontWeight: 900,
    lineHeight: 1.1,
  },
  datePillCount: {
    fontSize: 12,
    color: "#7d6d63",
    fontWeight: 800,
  },
  selectedDatePillCount: {
    fontSize: 12,
    color: "#F9E8EE",
    fontWeight: 800,
  },
  selectedSlots: {
    marginTop: 24,
    paddingTop: 18,
    borderTop: "1px solid #ead8dc",
  },
  selectedDateTitle: {
    marginTop: 0,
  },
  timelineList: { display: "flex", flexDirection: "column", gap: 0, width: "100%" },
  timelineRow: { display: "grid", gridTemplateColumns: "22px minmax(0, 1fr)", gap: 12, width: "100%" },
  timelineRail: { display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 22 },
  timelineDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0, background: "#79283E", border: "2px solid #fff", boxShadow: "0 0 0 1px #c9a6ae" },
  timelineLine: { width: 1, flex: 1, minHeight: 22, background: "#e8dfe1", marginTop: 7 },
  timelineContent: { minWidth: 0, background: "#fff", border: "1px solid #e9e5e6", borderRadius: 14, padding: "16px 17px", marginBottom: 12 },
  timelineTopLine: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  timelineTime: { fontSize: 16, color: "#252326", letterSpacing: "-0.025em" },
  timelineDuration: { fontSize: 12, color: "#777078" },
  timelineDescription: { margin: "7px 0 13px", fontSize: 12, color: "#777078", lineHeight: 1.5 },
  timelineActions: { display: "flex", flexWrap: "wrap", gap: 8 },
  timelineClosedLabel: { fontSize: 12, color: "#7c7779", fontWeight: 700 },
  timelineClosedButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 115, padding: "10px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, background: "#f2f1f2", color: "#777276", border: "1px solid #e5e2e4" },
  timelinePrimaryButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minWidth: 115, margin: 0, padding: "10px 16px", borderRadius: 9, fontSize: 13, fontWeight: 700, background: "#79283E", color: "#fff", border: "none", cursor: "pointer" },
  timelineSecondaryButton: { minWidth: 110, margin: 0, padding: "10px 13px", borderRadius: 9, fontSize: 12, background: "#fff", color: "#79283E", border: "1px solid #d8c1c6", cursor: "pointer" },
  timeGridFix: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  },
  timeButtonFix: {
    width: "100%",
    minWidth: 0,
    marginTop: 0,
    padding: "14px 10px",
    lineHeight: 1.3,
    whiteSpace: "normal",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  slotSubText: {
    fontSize: 12,
    lineHeight: 1.4,
    opacity: 0.78,
  },
  lifestyleSlotCard: {
    minWidth: 0,
    marginTop: 0,
    padding: "13px 12px",
    borderRadius: 18,
    border: "1px solid #ead8dc",
    background: "#fffdfb",
    color: "#541B2B",
    display: "flex",
    flexDirection: "column",
    gap: 9,
  },
  lifestyleButtonGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  lifestyleButton: {
    marginTop: 0,
    minWidth: 0,
    padding: "10px 8px",
    borderRadius: 999,
    fontSize: 13,
  },
};
