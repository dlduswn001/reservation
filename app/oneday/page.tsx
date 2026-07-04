"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import BottomNav from "../components/BottomNav";

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
  amount_due?: number | null;
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

type DescriptionSections = {
  intro: string;
  topic: string;
  goal: string;
  process: string[];
  payment: string;
};

const STUDENT_LOGIN_STORAGE_KEY = "munjangStudentLogin";

const ACTIVE_STATUSES = new Set(["booked", "입금대기", "등록대기", "입금완료", "등록완료"]);
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const PAYMENT_BANK = "카카오뱅크";
const PAYMENT_ACCOUNT = "3333-24-9663376";
const PAYMENT_HOLDER = "문장학교";

const STATUS_LABELS: Record<string, string> = {
  booked: "입금 대기",
  cancelled: "취소 완료",
  "입금대기": "입금 대기",
  "등록대기": "무료 등록 대기",
  "입금완료": "등록 완료",
  "등록완료": "등록 완료",
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

function saveStoredStudentLogin(student: { id?: string; name: string; phone_last4: string }) {
  try {
    window.localStorage.setItem(
      STUDENT_LOGIN_STORAGE_KEY,
      JSON.stringify({ id: student.id || "", name: student.name, phone_last4: student.phone_last4 }),
    );
  } catch {
    // 저장하지 못해도 신청 기능은 그대로 사용할 수 있습니다.
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

function formatMonthLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
  }).format(new Date(value));
}

function monthKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(value));
}

function isActiveBooking(status?: string) {
  return ACTIVE_STATUSES.has(String(status || ""));
}

function onedayProgressLabel(booking: OneDayBooking, now: number) {
  const oneClass = booking.oneday_classes;
  const status = String(booking.status || "");
  if (!isActiveBooking(status)) return statusLabel(status);
  if (oneClass && new Date(oneClass.end_at).getTime() <= now) return "수강 완료";
  return statusLabel(status);
}

type OneDayBookingMonthGroup = {
  key: string;
  label: string;
  bookings: OneDayBooking[];
};

function groupOneDayBookingsByMonth(bookings: OneDayBooking[]) {
  const groups = new Map<string, OneDayBookingMonthGroup>();

  for (const booking of bookings) {
    const date = booking.oneday_classes?.start_at || booking.created_at || new Date(0).toISOString();
    const key = monthKey(date);
    if (!groups.has(key)) {
      groups.set(key, { key, label: formatMonthLabel(date), bookings: [] });
    }
    groups.get(key)!.bookings.push(booking);
  }

  return Array.from(groups.values())
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((group) => ({
      ...group,
      bookings: group.bookings.sort((a, b) => {
        const aDate = a.oneday_classes?.start_at || a.created_at || "";
        const bDate = b.oneday_classes?.start_at || b.created_at || "";
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      }),
    }));
}

function statusLabel(status?: string) {
  if (!status) return "-";
  return STATUS_LABELS[status] || status;
}

function parseTitle(title: string) {
  const angleMatch = title.match(/^\s*(.*?)\s*[<〈](.*?)[>〉]\s*$/);
  if (!angleMatch) {
    return { eyebrow: "문장학교 원데이 클래스", heading: title };
  }

  const outer = angleMatch[1].replace(/\s*수업\s*$/, "").trim();
  const inner = angleMatch[2].trim();
  const numbered = inner.match(/^(\d{1,3})\.\s*(.*)$/);

  if (!numbered) {
    return { eyebrow: outer || "문장학교 원데이 클래스", heading: inner };
  }

  return {
    eyebrow: `${outer || "문장학교 원데이 클래스"} #${numbered[1]}`,
    heading: numbered[2],
  };
}

function cleanSectionText(value: string) {
  return value
    .replace(/^\s*[:：]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitProcess(value: string) {
  const cleaned = cleanSectionText(value);
  if (!cleaned) return [];

  const pieces = cleaned
    .split(/\s*(?:,|·|\n)\s*/)
    .map((item) => item.trim())
    .filter(Boolean);

  return pieces.length > 1 ? pieces : [cleaned];
}

function parseDescription(description?: string): DescriptionSections {
  const text = String(description || "").replace(/\r/g, "").trim();
  if (!text) {
    return { intro: "", topic: "", goal: "", process: [], payment: "" };
  }

  const topicMarker = "수업 주제";
  const goalMarker = "수업 목표";
  const processMarkers = ["리딩 방식", "진행 방식", "수업 방식"];
  const paymentMarkers = ["원데이 클래스 신청 후", "신청 후", "입금 안내"];

  const topicIndex = text.indexOf(topicMarker);
  const goalIndex = text.indexOf(goalMarker);
  const processEntry = processMarkers
    .map((marker) => ({ marker, index: text.indexOf(marker) }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index)[0];
  const paymentEntry = paymentMarkers
    .map((marker) => ({ marker, index: text.indexOf(marker) }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index)[0];

  const sectionIndexes = [topicIndex, goalIndex, processEntry?.index ?? -1, paymentEntry?.index ?? -1]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  const firstSectionIndex = sectionIndexes[0] ?? text.length;

  const sliceUntil = (start: number, candidates: number[]) => {
    const next = candidates.filter((index) => index > start).sort((a, b) => a - b)[0] ?? text.length;
    return text.slice(start, next);
  };

  const intro = cleanSectionText(text.slice(0, firstSectionIndex));
  const topic = topicIndex >= 0
    ? cleanSectionText(sliceUntil(topicIndex + topicMarker.length, [goalIndex, processEntry?.index ?? -1, paymentEntry?.index ?? -1]))
    : "";
  const goal = goalIndex >= 0
    ? cleanSectionText(sliceUntil(goalIndex + goalMarker.length, [processEntry?.index ?? -1, paymentEntry?.index ?? -1]))
    : "";
  const processText = processEntry
    ? cleanSectionText(sliceUntil(processEntry.index + processEntry.marker.length, [paymentEntry?.index ?? -1]))
    : "";
  const payment = paymentEntry ? cleanSectionText(text.slice(paymentEntry.index)) : "";

  if (!topic && !goal && !processText) {
    return { intro: text, topic: "", goal: "", process: [], payment: "" };
  }

  return {
    intro,
    topic,
    goal,
    process: splitProcess(processText),
    payment,
  };
}

export default function OneDayPage() {
  const [classes, setClasses] = useState<OneDayClass[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [rememberLogin, setRememberLogin] = useState(true);
  const [peopleCount, setPeopleCount] = useState(1);
  const [message, setMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const applicationRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    const saved = readStoredStudentLogin();
    if (saved) {
      setName(saved.name);
      setPhoneLast4(saved.phone_last4);
      setLookupName(saved.name);
      setLookupPhoneLast4(saved.phone_last4);
      setRememberLogin(true);
      loadMyBookings(saved.name, saved.phone_last4);
    }
  }, []);

  function chooseClass(classId: string) {
    setSelected(classId);
    window.setTimeout(() => {
      applicationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function copyAccount() {
    const accountText = `${PAYMENT_BANK} ${PAYMENT_ACCOUNT} ${PAYMENT_HOLDER}`;
    try {
      await navigator.clipboard.writeText(PAYMENT_ACCOUNT);
      setCopyMessage("계좌번호를 복사했습니다.");
    } catch {
      setCopyMessage(`계좌번호: ${accountText}`);
    }
    window.setTimeout(() => setCopyMessage(""), 2500);
  }

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
    if (rememberLogin) {
      saveStoredStudentLogin({ name: targetName, phone_last4: targetPhone });
    }
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
    if (rememberLogin) {
      saveStoredStudentLogin({ name: submittedName, phone_last4: submittedPhone });
    }
    setMessage(Number(json.amount_due || 0) === 0 ? "원데이 클래스 신청이 접수되었습니다. 이번 달 무료 수강 혜택이 적용되었습니다." : "원데이 클래스 신청이 접수되었습니다. 추가 수강료 10,000원을 문장학교 카카오뱅크 계좌로 납부해 주세요.");
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

  function clearSavedStudent() {
    clearStoredStudentLogin();
    setName("");
    setPhoneLast4("");
    setLookupName("");
    setLookupPhoneLast4("");
    setMyBookings([]);
    setLookupDone(false);
    setLookupMessage("자동 로그인 정보를 지웠습니다. 다시 입력해 주세요.");
  }

  const activeMyBookings = useMemo(() => {
    return myBookings
      .filter((booking) => isActiveBooking(booking.status))
      .sort((a, b) => {
        const aDate = a.oneday_classes?.start_at || a.created_at || "";
        const bDate = b.oneday_classes?.start_at || b.created_at || "";
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });
  }, [myBookings]);

  const activeMyBookingGroups = useMemo(
    () => groupOneDayBookingsByMonth(activeMyBookings),
    [activeMyBookings],
  );

  return (
    <main className="container onedayPage">
      <section className="card onedayHero">
        <span className="onedayHeroBadge">문장학교 정규수강생 전용</span>
        <h1>원데이 클래스</h1>
        <p>새로운 주제를 읽고 쓰며, 평소 수업과는 다른 방식으로 깊이 있게 만나보세요.</p>
        <div className="onedayNoticeRow">
          <span>정원 5명</span>
          <span>수업 시작 6시간 전까지 취소 가능</span>
        </div>
        {message && <p className={message.includes("완료") ? "success" : "error"}>{message}</p>}
      </section>

      <section className="card">
        <div className="onedaySectionHeading">
          <div>
            <span className="sectionEyebrow">NOW OPEN</span>
            <h2>개설 클래스</h2>
          </div>
          <p className="small">핵심 정보를 확인하고, 자세히 보기를 눌러 수업 내용을 살펴보세요.</p>
        </div>

        <div className="onedayClassGrid">
          {classes.length === 0 && <p>현재 신청 가능한 원데이 클래스가 없습니다.</p>}
          {classes.map((c) => {
            const title = parseTitle(c.title);
            const sections = parseDescription(c.description);
            const expanded = expandedClassId === c.id;
            const soldOut = c.remaining <= 0;

            return (
              <article className={`onedayClassCard ${expanded ? "expanded" : ""}`} key={c.id}>
                <div className="onedayClassSummary">
                  <div className="onedayTitleBlock">
                    <span className="onedayEyebrow">{title.eyebrow}</span>
                    <h3>{title.heading}</h3>
                  </div>

                  <div className="onedayMetaGrid">
                    <div className="onedayMetaItem">
                      <span>일정</span>
                      <strong>{formatDateTime(c.start_at)}–{formatTime(c.end_at)}</strong>
                    </div>
                    <div className="onedayMetaItem">
                      <span>자리</span>
                      <strong className={soldOut ? "soldOutText" : ""}>
                        {soldOut ? "마감" : `${Math.max(0, c.remaining)}자리 남음`}
                      </strong>
                    </div>
                  </div>

                  <div className="onedayCardActions">
                    <button
                      type="button"
                      className="secondary compact"
                      onClick={() => setExpandedClassId(expanded ? null : c.id)}
                      aria-expanded={expanded}
                    >
                      {expanded ? "내용 접기" : "자세히 보기"}
                    </button>
                    <button
                      type="button"
                      className="compact"
                      onClick={() => chooseClass(c.id)}
                      disabled={soldOut}
                    >
                      {soldOut ? "신청 마감" : "신청하기"}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="onedayDetails">
                    {sections.intro && (
                      <section className="onedayDetailSection introSection">
                        <span className="detailLabel">문장학교 세계문학 리딩</span>
                        <p>{sections.intro}</p>
                      </section>
                    )}

                    {sections.topic && (
                      <section className="onedayDetailSection questionSection">
                        <span className="detailLabel">이번 수업의 질문</span>
                        <strong>{sections.topic}</strong>
                      </section>
                    )}

                    {sections.goal && (
                      <section className="onedayDetailSection">
                        <span className="detailLabel">수업 목표</span>
                        <p>{sections.goal}</p>
                      </section>
                    )}

                    {sections.process.length > 0 && (
                      <section className="onedayDetailSection">
                        <span className="detailLabel">이렇게 진행합니다</span>
                        <ul className="processList">
                          {sections.process.map((item, index) => <li key={`${c.id}-process-${index}`}>{item}</li>)}
                        </ul>
                      </section>
                    )}

                    {!sections.intro && !sections.topic && !sections.goal && sections.process.length === 0 && c.description && (
                      <section className="onedayDetailSection">
                        <span className="detailLabel">수업 안내</span>
                        <p>{c.description}</p>
                      </section>
                    )}

                    <section className="onedayPaymentBox">
                      <div>
                        <span className="detailLabel">신청 완료 안내</span>
                        <p>정규수강생은 원데이 클래스를 월 1회 무료 수강할 수 있습니다. 추가 수강을 희망할 경우, 수강료 10,000원을 다음 계좌로 납부하시면 되어요. :)</p>
                        <strong>문장학교 {PAYMENT_BANK} · {PAYMENT_ACCOUNT} · 예금주 {PAYMENT_HOLDER}</strong>
                        {sections.payment && <p className="small">{sections.payment}</p>}
                        {copyMessage && <p className="success small">{copyMessage}</p>}
                      </div>
                      <button type="button" className="secondary compact" onClick={copyAccount}>계좌번호 복사</button>
                    </section>

                    <div className="onedayStickyAction singleAction">
                      <button type="button" onClick={() => chooseClass(c.id)} disabled={soldOut}>
                        {soldOut ? "신청 마감" : "원데이 클래스 신청하기"}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="card" ref={applicationRef}>
        <span className="sectionEyebrow">APPLICATION</span>
        <h2>신청하기</h2>
        <p className="small">등록된 정규수강생의 이름과 핸드폰번호 뒷자리로 신청해 주세요.</p>
        <label>신청할 클래스</label>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">선택해 주세요</option>
          {classes.filter((c) => c.remaining > 0).map((c) => <option value={c.id} key={c.id}>{c.title}</option>)}
        </select>
        <label>이름</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <label>핸드폰번호 뒷자리 4자리</label>
        <input value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" maxLength={4} />
        <label className="checkboxRow">
          <input type="checkbox" checked={rememberLogin} onChange={(e) => setRememberLogin(e.target.checked)} />
          <span>이 기기에서 자동 로그인하기</span>
        </label>
        <label>참여 인원</label>
        <input type="number" min={1} max={5} value={peopleCount} onChange={(e) => setPeopleCount(Number(e.target.value))} />
        <button onClick={reserve}>신청하기</button>
        <div className="applicationPaymentNote">
          <strong>정규수강생은 원데이 클래스를 월 1회 무료 수강할 수 있습니다.</strong>
          <span>추가 수강을 희망할 경우, 수강료 10,000원을 다음 계좌로 납부하시면 되어요. :)</span>
          <span>문장학교 {PAYMENT_BANK} {PAYMENT_ACCOUNT} / 예금주 {PAYMENT_HOLDER}</span>
          <button type="button" className="secondary compact" onClick={copyAccount}>계좌번호 복사</button>
        </div>
      </section>

      <section className="card">
        <span className="sectionEyebrow">MY BOOKING</span>
        <h2>내 신청 내역 및 취소</h2>
        <p>신청할 때 입력한 이름과 핸드폰번호 뒷자리로 입금 대기·등록 완료·수강 완료된 원데이 내역만 월별로 확인할 수 있습니다.</p>
        <label>이름</label>
        <input value={lookupName} onChange={(e) => setLookupName(e.target.value)} />
        <label>핸드폰번호 뒷자리 4자리</label>
        <input
          value={lookupPhoneLast4}
          onChange={(e) => setLookupPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          maxLength={4}
        />
        <label className="checkboxRow">
          <input type="checkbox" checked={rememberLogin} onChange={(e) => setRememberLogin(e.target.checked)} />
          <span>이 기기에서 자동 로그인하기</span>
        </label>
        <div className="inlineActions">
          <button onClick={() => loadMyBookings()} disabled={loadingBookings}>
          {loadingBookings ? "확인 중..." : "신청 내역 확인하기"}
          </button>
          <button type="button" className="secondary" onClick={clearSavedStudent}>로그아웃 / 다른 수강생으로 확인하기</button>
        </div>

        {lookupMessage && (
          <p className={lookupMessage.includes("취소되었습니다") ? "success" : "error"}>{lookupMessage}</p>
        )}

        {lookupDone && (
          <div className="list onedayBookingList">
            {activeMyBookings.length === 0 && <p>현재 확인되는 신청 완료 또는 수강 완료 원데이 클래스가 없습니다.</p>}
            {activeMyBookingGroups.map((group) => (
              <div className="monthGroup" key={group.key}>
                <h3>{group.label}</h3>
                <div className="list compactList">
                  {group.bookings.map((booking) => {
                    const oneClass = booking.oneday_classes;
                    const status = String(booking.status || "");
                    const startTime = oneClass?.start_at ? new Date(oneClass.start_at).getTime() : 0;
                    const endTime = oneClass?.end_at ? new Date(oneClass.end_at).getTime() : 0;
                    const isBeforeStart = startTime > currentTime;
                    const isBeforeCancelDeadline = startTime - currentTime >= SIX_HOURS_MS;
                    const isCompleted = Boolean(oneClass && endTime <= currentTime);
                    const canCancel = Boolean(oneClass && isBeforeStart && isBeforeCancelDeadline);
                    const price = booking.amount_due ?? oneClass?.regular_price ?? 10000;

                    return (
                      <div className="item bookingItem" key={booking.id}>
                        <div>
                          <strong>{oneClass?.title || "원데이 클래스"}</strong>
                          {oneClass ? (
                            <>
                              <p>{formatDateTime(oneClass.start_at)} - {formatTime(oneClass.end_at)}</p>
                              <p className="small">신청 인원: {booking.people_count || 1}명 / 상태: {onedayProgressLabel(booking, currentTime)}</p>
                              <p className="small">비용: {formatOneDayAmount(price)}</p>
                            </>
                          ) : (
                            <p className="small">삭제되었거나 확인할 수 없는 클래스입니다.</p>
                          )}
                          {oneClass && isBeforeStart && !isBeforeCancelDeadline && (
                            <p className="small error">수업 시작 6시간 이내라 온라인 취소가 마감되었습니다.</p>
                          )}
                          {isCompleted && (
                            <p className="small">수강 완료된 원데이 클래스입니다.</p>
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
              </div>
            ))}
          </div>
        )}
      </section>
      <BottomNav />
    </main>
  );
}
