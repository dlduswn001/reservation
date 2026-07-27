"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import BottomNav from "../components/BottomNav";

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
};

type Booking = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  memo?: string;
};

const STUDENT_LOGIN_STORAGE_KEY = "munjangStudentLogin";
const SLOT_CACHE_STORAGE_KEY = "munjangRegularSlotCacheV15";
const SLOT_CACHE_TTL_MS = 5 * 60 * 1000;

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
  // 예약은 3시간 전까지만 가능하므로, 화면도 "지금 + 3시간"이 속한 달만 빠르게 준비합니다.
  const cutoffLikeServer = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(cutoffLikeServer);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  return `${year}-${month}`;
}

function slotCacheKey(studentId: string) {
  return `${SLOT_CACHE_STORAGE_KEY}:${studentId}:${estimateOpenMonthKey()}`;
}

function readCachedSlots(studentId: string) {
  try {
    const saved = window.sessionStorage.getItem(slotCacheKey(studentId));
    if (!saved) return null;
    const parsed = JSON.parse(saved) as { savedAt?: number; slots?: Slot[] };
    if (!parsed.savedAt || !Array.isArray(parsed.slots)) return null;
    if (Date.now() - parsed.savedAt > SLOT_CACHE_TTL_MS) return null;
    return parsed.slots;
  } catch {
    return null;
  }
}

function saveCachedSlots(studentId: string, nextSlots: Slot[]) {
  try {
    window.sessionStorage.setItem(
      slotCacheKey(studentId),
      JSON.stringify({ savedAt: Date.now(), slots: nextSlots }),
    );
  } catch {
    // 캐시 저장에 실패해도 예약 기능은 그대로 사용할 수 있습니다.
  }
}

function clearCachedSlots(studentId: string) {
  try {
    window.sessionStorage.removeItem(slotCacheKey(studentId));
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
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
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

  async function loadData(studentId: string, options: { useCache?: boolean } = {}) {
    const useCache = options.useCache !== false;
    const lessonMinutes = student?.lesson_duration_minutes || "";

    if (useCache) {
      const cachedSlots = readCachedSlots(studentId);
      if (cachedSlots) {
        setSlots(cachedSlots);
        setIsLoadingData(false);
      } else {
        setIsLoadingData(true);
      }
    } else {
      clearCachedSlots(studentId);
      setIsLoadingData(true);
    }

    const slotRequest = fetch(`/api/slots?studentId=${studentId}&lessonMinutes=${lessonMinutes}`)
      .then(async (slotRes) => {
        const slotJson = await slotRes.json();
        if (!slotRes.ok) throw new Error(slotJson.message || "예약 가능한 시간을 불러오지 못했습니다.");
        const nextSlots = slotJson.slots || [];
        setSlots(nextSlots);
        saveCachedSlots(studentId, nextSlots);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "예약 가능한 시간을 불러오지 못했습니다.");
      })
      .finally(() => {
        setIsLoadingData(false);
      });

    const bookingRequest = fetch(`/api/student/bookings?studentId=${studentId}`)
      .then(async (bookingRes) => {
        const bookingJson = await bookingRes.json();
        if (!bookingRes.ok) throw new Error(bookingJson.message || "예약 내역을 불러오지 못했습니다.");
        setBookings(bookingJson.bookings || []);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "예약 내역을 불러오지 못했습니다.");
      });

    await Promise.allSettled([slotRequest, bookingRequest]);
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

  useEffect(() => {
    if (availableDateKeys.length === 0) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate((current) => {
      if (current && availableDateKeys.includes(current)) return current;
      return availableDateKeys[0];
    });
  }, [availableDateKeys]);

  const selectedSlots = selectedDate ? slotsByDate[selectedDate] || [] : [];

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
    await loadData(student.id, { useCache: false });
  }

  function logoutStudent() {
    clearStoredStudentLogin();
    setStudent(null);
    setName("");
    setPhoneLast4("");
    setSlots([]);
    setBookings([]);
    setSelectedDate(null);
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
    await loadData(student.id, { useCache: false });
  }

  return (
    <main className="container appContainer" style={styles.appContainer}>
      <section className="card" style={styles.topCardFix}>
        <h1>정규수업 예약</h1>
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
            <div className="noticeBox">
              <p>수업 예약은 시작 3시간 전까지 가능합니다.</p>
              <p>수업 취소는 3시간 전까지 가능하며, 3시간 이내 취소 시 수강권이 차감됩니다.</p>
            </div>
          </div>
        )}
        {message && <p className={message.includes("완료") || message.includes("접수") ? "success" : "error"}>{message}</p>}
      </section>

      {student && (
        <>
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

          <section className="card" style={styles.cardFix}>
            <div style={styles.reservationHeader}>
              <div>
                <h2 style={styles.reservationTitle}>예약 가능한 날짜</h2>
                <p style={styles.helperText}>수업일정은 한 달 단위로 열립니다. 예약 마감된 일정은 보이지 않습니다.</p>
              </div>
              <button
                className="secondary compact"
                type="button"
                onClick={() => student && loadData(student.id, { useCache: false })}
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
                <div style={styles.monthList}>
                  {Object.entries(dateKeysByMonth).map(([monthKey, dateKeys]) => (
                    <div key={monthKey} style={styles.monthBlock}>
                      <h3 style={styles.monthTitle}>{formatMonthTitle(`${monthKey}-01`)}</h3>
                      <div style={styles.datePillGrid}>
                        {dateKeys.map((dateKey) => {
                          const count = slotsByDate[dateKey]?.length || 0;
                          const isSelected = selectedDate === dateKey;
                          return (
                            <button
                              key={dateKey}
                              type="button"
                              onClick={() => setSelectedDate(dateKey)}
                              style={isSelected ? styles.selectedDatePill : styles.datePill}
                            >
                              <span style={styles.datePillDate}>{formatShortDateLabel(dateKey)}</span>
                              <span style={isSelected ? styles.selectedDatePillCount : styles.datePillCount}>{count}개 시간</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="selectedSlots" style={styles.selectedSlots}>
                  <h3 style={styles.selectedDateTitle}>{selectedDate ? formatDateLabel(selectedDate) : "예약 가능한 시간"}</h3>
                  {(student.lesson_credits ?? 0) <= 0 && <p className="error">잔여 수강권이 없어 예약할 수 없습니다. 관리자에게 문의해 주세요.</p>}
                  {selectedSlots.length === 0 && <p>선택한 날짜에는 예약 가능한 시간이 없습니다.</p>}
                  <div className="timeGrid" style={styles.timeGridFix}>
                    {selectedSlots.map((slot) => (
                      <button
                        className="timeButton"
                        key={slot.id}
                        onClick={() => book(slot.id)}
                        disabled={(student.lesson_credits ?? 0) <= 0}
                        style={styles.timeButtonFix}
                      >
                        <span>{formatTime(slot.start_at)} - {formatTime(slot.end_at)} 예약하기</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
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
    flexDirection: "column",
    gap: 4,
  },
};
