"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@supabase/supabase-js";

/**
 * 문장학교 정규수업 예약 페이지 - 속도 개선 버전
 *
 * 핵심 개선 사항
 * 1. 과거 일정은 불러오지 않습니다.
 * 2. 예약 가능한 일정(is_available = true)만 불러옵니다.
 * 3. 오늘부터 다음 달 말까지만 불러옵니다.
 * 4. 예약 가능한 시간이 없는 달은 화면에 표시하지 않습니다.
 * 5. 예약 완료 후 해당 슬롯은 즉시 is_available=false 처리합니다.
 *
 * 사용 방법
 * - 이 파일을 정규수업 예약 페이지의 page.tsx에 그대로 교체해서 업로드하세요.
 * - Supabase 테이블 기준: students, slots, reservations
 * - students: id, name, phone_last4, lesson_credits
 * - slots: id, start_at, end_at, is_available
 * - reservations: id, student_id, slot_id, created_at
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Student = {
  id: string;
  name: string;
  phone_last4: string;
  lesson_credits?: number | null;
};

type Slot = {
  id: string;
  start_at: string;
  end_at: string;
  is_available: boolean;
};

type Reservation = {
  id: string;
  student_id: string;
  slot_id: string;
  created_at?: string;
};

const KOREA_LOCALE = "ko-KR";

function getBookingRange() {
  const now = new Date();
  const endOfNextMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 2,
    0,
    23,
    59,
    59,
    999
  );

  return {
    nowIso: now.toISOString(),
    endIso: endOfNextMonth.toISOString(),
  };
}

function formatMonth(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString(KOREA_LOCALE, {
    year: "numeric",
    month: "long",
  });
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString(KOREA_LOCALE, {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatTimeRange(startString: string, endString: string) {
  const start = new Date(startString);
  const end = new Date(endString);

  const startText = start.toLocaleTimeString(KOREA_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const endText = end.toLocaleTimeString(KOREA_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${startText} - ${endText}`;
}

function groupSlotsByMonthAndDate(slots: Slot[]) {
  const result: Record<string, Record<string, Slot[]>> = {};

  for (const slot of slots) {
    const monthKey = formatMonth(slot.start_at);
    const dateKey = formatDate(slot.start_at);

    if (!result[monthKey]) result[monthKey] = {};
    if (!result[monthKey][dateKey]) result[monthKey][dateKey] = [];

    result[monthKey][dateKey].push(slot);
  }

  return result;
}

export default function RegularReservationPage() {
  const [name, setName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const groupedSlots = useMemo(() => groupSlotsByMonthAndDate(slots), [slots]);
  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.id === selectedSlotId) || null,
    [slots, selectedSlotId]
  );

  async function loginStudent() {
    setMessage("");
    setErrorMessage("");

    const trimmedName = name.trim();
    const trimmedPhone = phoneLast4.trim();

    if (!trimmedName || !trimmedPhone) {
      setErrorMessage("이름과 휴대폰 번호 뒷 4자리를 입력해 주세요.");
      return;
    }

    if (trimmedPhone.length !== 4) {
      setErrorMessage("휴대폰 번호 뒷 4자리는 숫자 4자리로 입력해 주세요.");
      return;
    }

    setIsLoggingIn(true);

    const { data, error } = await supabase
      .from("students")
      .select("id, name, phone_last4, lesson_credits")
      .eq("name", trimmedName)
      .eq("phone_last4", trimmedPhone)
      .maybeSingle();

    setIsLoggingIn(false);

    if (error) {
      setErrorMessage("수강생 정보를 확인하는 중 오류가 발생했습니다.");
      return;
    }

    if (!data) {
      setErrorMessage("일치하는 수강생 정보를 찾을 수 없습니다. 이름과 휴대폰 번호 뒷 4자리를 확인해 주세요.");
      return;
    }

    setStudent(data as Student);
    setMessage(`${data.name}님, 예약 가능한 일정을 불러오고 있습니다.`);
  }

  async function loadAvailableSlots() {
    setMessage("");
    setErrorMessage("");
    setIsLoadingSlots(true);

    const { nowIso, endIso } = getBookingRange();

    const { data, error } = await supabase
      .from("slots")
      .select("id, start_at, end_at, is_available")
      .gte("start_at", nowIso)
      .lte("start_at", endIso)
      .eq("is_available", true)
      .order("start_at", { ascending: true })
      .limit(300);

    setIsLoadingSlots(false);

    if (error) {
      setErrorMessage("예약 가능한 일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setSlots((data || []) as Slot[]);
    setSelectedSlotId(null);

    if (!data || data.length === 0) {
      setMessage("현재 예약 가능한 정규수업 일정이 없습니다.");
    }
  }

  async function bookSelectedSlot() {
    if (!student) {
      setErrorMessage("먼저 수강생 로그인을 해 주세요.");
      return;
    }

    if (!selectedSlot) {
      setErrorMessage("예약할 시간을 선택해 주세요.");
      return;
    }

    if (student.lesson_credits !== null && student.lesson_credits !== undefined && student.lesson_credits <= 0) {
      setErrorMessage("남은 수강권이 없습니다. 관리자에게 문의해 주세요.");
      return;
    }

    const confirmed = window.confirm(
      `${formatDate(selectedSlot.start_at)} ${formatTimeRange(
        selectedSlot.start_at,
        selectedSlot.end_at
      )} 수업을 예약할까요?`
    );

    if (!confirmed) return;

    setIsBooking(true);
    setMessage("");
    setErrorMessage("");

    const { data: latestSlot, error: latestSlotError } = await supabase
      .from("slots")
      .select("id, is_available")
      .eq("id", selectedSlot.id)
      .maybeSingle();

    if (latestSlotError || !latestSlot || latestSlot.is_available !== true) {
      setIsBooking(false);
      setErrorMessage("이미 예약되었거나 예약할 수 없는 시간입니다. 다른 시간을 선택해 주세요.");
      await loadAvailableSlots();
      return;
    }

    const { data: existingReservation, error: existingReservationError } = await supabase
      .from("reservations")
      .select("id")
      .eq("slot_id", selectedSlot.id)
      .limit(1);

    if (existingReservationError) {
      setIsBooking(false);
      setErrorMessage("예약 가능 여부를 확인하는 중 오류가 발생했습니다.");
      return;
    }

    if (existingReservation && existingReservation.length > 0) {
      await supabase.from("slots").update({ is_available: false }).eq("id", selectedSlot.id);
      setIsBooking(false);
      setErrorMessage("방금 다른 수강생이 예약한 시간입니다. 다른 시간을 선택해 주세요.");
      await loadAvailableSlots();
      return;
    }

    const { error: reservationError } = await supabase.from("reservations").insert({
      student_id: student.id,
      slot_id: selectedSlot.id,
    });

    if (reservationError) {
      setIsBooking(false);
      setErrorMessage("예약을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const { error: slotUpdateError } = await supabase
      .from("slots")
      .update({ is_available: false })
      .eq("id", selectedSlot.id);

    if (slotUpdateError) {
      setIsBooking(false);
      setErrorMessage("예약은 접수되었지만 일정 상태 변경 중 오류가 발생했습니다. 관리자에게 문의해 주세요.");
      await loadAvailableSlots();
      return;
    }

    if (typeof student.lesson_credits === "number") {
      const nextCredits = Math.max(student.lesson_credits - 1, 0);
      const { error: creditError } = await supabase
        .from("students")
        .update({ lesson_credits: nextCredits })
        .eq("id", student.id);

      if (!creditError) {
        setStudent({ ...student, lesson_credits: nextCredits });
      }
    }

    setIsBooking(false);
    setMessage("예약이 완료되었습니다. 예약 가능한 일정 목록을 새로 불러왔습니다.");
    await loadAvailableSlots();
  }

  useEffect(() => {
    if (student) {
      loadAvailableSlots();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id]);

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.header}>
          <p style={styles.eyebrow}>문장학교 예약</p>
          <h1 style={styles.title}>정규수업 예약하기</h1>
          <p style={styles.description}>
            오늘 이후 예약 가능한 일정만 빠르게 불러옵니다. 예약 가능한 시간이 없는 달은 표시되지 않습니다.
          </p>
        </div>

        {!student ? (
          <div style={styles.loginBox}>
            <label style={styles.label}>
              이름
              <input
                style={styles.input}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="예: 이연주"
              />
            </label>

            <label style={styles.label}>
              휴대폰 번호 뒷 4자리
              <input
                style={styles.input}
                value={phoneLast4}
                onChange={(event) => setPhoneLast4(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
                placeholder="예: 1234"
                inputMode="numeric"
                maxLength={4}
              />
            </label>

            <button style={styles.primaryButton} onClick={loginStudent} disabled={isLoggingIn}>
              {isLoggingIn ? "확인 중..." : "예약 일정 확인하기"}
            </button>
          </div>
        ) : (
          <div>
            <div style={styles.studentBox}>
              <div>
                <strong>{student.name}님</strong>
                <p style={styles.smallText}>정규수업 예약 가능 일정을 확인해 주세요.</p>
              </div>
              <div style={styles.creditBox}>
                남은 수강권: {typeof student.lesson_credits === "number" ? `${student.lesson_credits}회` : "확인 필요"}
              </div>
            </div>

            <div style={styles.actionRow}>
              <button style={styles.secondaryButton} onClick={loadAvailableSlots} disabled={isLoadingSlots}>
                {isLoadingSlots ? "불러오는 중..." : "예약 가능 일정 새로고침"}
              </button>
              <button style={styles.textButton} onClick={() => setStudent(null)}>
                다른 수강생으로 확인
              </button>
            </div>

            {isLoadingSlots ? (
              <div style={styles.emptyBox}>예약 가능한 일정을 불러오고 있습니다.</div>
            ) : slots.length === 0 ? (
              <div style={styles.emptyBox}>현재 예약 가능한 정규수업 일정이 없습니다.</div>
            ) : (
              <div style={styles.slotArea}>
                {Object.entries(groupedSlots).map(([month, dateGroups]) => (
                  <section key={month} style={styles.monthSection}>
                    <h2 style={styles.monthTitle}>{month}</h2>
                    {Object.entries(dateGroups).map(([date, dateSlots]) => (
                      <div key={date} style={styles.dateSection}>
                        <h3 style={styles.dateTitle}>{date}</h3>
                        <div style={styles.slotGrid}>
                          {dateSlots.map((slot) => {
                            const isSelected = selectedSlotId === slot.id;
                            return (
                              <button
                                key={slot.id}
                                style={{
                                  ...styles.slotButton,
                                  ...(isSelected ? styles.selectedSlotButton : {}),
                                }}
                                onClick={() => setSelectedSlotId(slot.id)}
                              >
                                {formatTimeRange(slot.start_at, slot.end_at)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}

            {selectedSlot && (
              <div style={styles.confirmBox}>
                <div>
                  <strong>선택한 수업</strong>
                  <p style={styles.smallText}>
                    {formatDate(selectedSlot.start_at)} {formatTimeRange(selectedSlot.start_at, selectedSlot.end_at)}
                  </p>
                </div>
                <button style={styles.primaryButton} onClick={bookSelectedSlot} disabled={isBooking}>
                  {isBooking ? "예약 중..." : "이 시간으로 예약하기"}
                </button>
              </div>
            )}
          </div>
        )}

        {message && <div style={styles.messageBox}>{message}</div>}
        {errorMessage && <div style={styles.errorBox}>{errorMessage}</div>}
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f7f3ec",
    padding: "32px 16px",
    color: "#2f2a25",
  },
  card: {
    maxWidth: 860,
    margin: "0 auto",
    background: "#fffaf4",
    border: "1px solid #eadfce",
    borderRadius: 24,
    padding: "28px",
    boxShadow: "0 16px 40px rgba(50, 38, 25, 0.08)",
  },
  header: {
    marginBottom: 24,
  },
  eyebrow: {
    margin: 0,
    fontSize: 14,
    letterSpacing: "0.08em",
    color: "#8b6f4e",
    fontWeight: 700,
  },
  title: {
    margin: "8px 0 10px",
    fontSize: 30,
    lineHeight: 1.25,
  },
  description: {
    margin: 0,
    color: "#6f6258",
    lineHeight: 1.6,
  },
  loginBox: {
    display: "grid",
    gap: 14,
  },
  label: {
    display: "grid",
    gap: 8,
    fontSize: 14,
    fontWeight: 700,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #decfbb",
    borderRadius: 14,
    padding: "14px 15px",
    fontSize: 16,
    background: "#fff",
  },
  primaryButton: {
    border: "none",
    borderRadius: 14,
    padding: "14px 18px",
    fontSize: 16,
    fontWeight: 800,
    color: "#fff",
    background: "#5b4636",
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #d3c2ad",
    borderRadius: 14,
    padding: "12px 16px",
    fontSize: 15,
    fontWeight: 700,
    color: "#4b392d",
    background: "#fff",
    cursor: "pointer",
  },
  textButton: {
    border: "none",
    background: "transparent",
    color: "#7a644e",
    fontSize: 14,
    cursor: "pointer",
    textDecoration: "underline",
  },
  studentBox: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    padding: 16,
    background: "#f2e8dc",
    borderRadius: 18,
    marginBottom: 16,
  },
  creditBox: {
    padding: "10px 12px",
    background: "#fffaf4",
    borderRadius: 999,
    fontSize: 14,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },
  smallText: {
    margin: "5px 0 0",
    color: "#76685c",
    fontSize: 14,
    lineHeight: 1.5,
  },
  actionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  emptyBox: {
    padding: 28,
    textAlign: "center",
    color: "#77685c",
    background: "#fff",
    border: "1px dashed #dac9b6",
    borderRadius: 18,
  },
  slotArea: {
    display: "grid",
    gap: 24,
  },
  monthSection: {
    display: "grid",
    gap: 14,
  },
  monthTitle: {
    fontSize: 22,
    margin: "8px 0 0",
  },
  dateSection: {
    padding: 16,
    background: "#fff",
    border: "1px solid #eadfce",
    borderRadius: 18,
  },
  dateTitle: {
    fontSize: 17,
    margin: "0 0 12px",
  },
  slotGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 10,
  },
  slotButton: {
    border: "1px solid #d8c7b4",
    borderRadius: 14,
    padding: "12px 10px",
    fontSize: 15,
    fontWeight: 700,
    background: "#fffaf4",
    color: "#3f3026",
    cursor: "pointer",
  },
  selectedSlotButton: {
    background: "#5b4636",
    color: "#fff",
    borderColor: "#5b4636",
  },
  confirmBox: {
    position: "sticky",
    bottom: 16,
    marginTop: 24,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    padding: 16,
    background: "#efe2d0",
    border: "1px solid #d5bea2",
    borderRadius: 20,
    boxShadow: "0 14px 30px rgba(50, 38, 25, 0.12)",
  },
  messageBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    background: "#edf7ee",
    color: "#245c2b",
    fontSize: 14,
    lineHeight: 1.5,
  },
  errorBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    background: "#fff0ed",
    color: "#9b2c18",
    fontSize: 14,
    lineHeight: 1.5,
  },
};
