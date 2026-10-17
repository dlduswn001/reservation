"use client";

import { useEffect, useState } from "react";
import BottomNav from "../components/BottomNav";

type Lesson = {
  id: string; title: string; start_at: string; end_at: string;
  description?: string | null; remaining: number;
};
type Booking = {
  id: string; people_count?: number; status?: string; waitlist_position?: number | null;
  oneday_classes?: { title: string; start_at: string; end_at: string } | null;
};
const ACTIVE = new Set(["booked", "입금대기", "등록대기", "입금완료", "등록완료"]);
const CUTOFF_MS = 3 * 60 * 60 * 1000;
const STUDENT_KEY = "munjangStudentLogin";
const simpleCard: React.CSSProperties = {
  background: "#fff", border: "1px solid #e7e7e7", borderRadius: 16,
  padding: 20, marginBottom: 16, boxShadow: "none",
};
const secondary: React.CSSProperties = { color: "#717171", fontSize: 13, lineHeight: 1.7 };
const primaryButton: React.CSSProperties = {
  width: "100%", background: "#222", color: "#fff", border: 0,
  borderRadius: 10, padding: "13px 16px", fontWeight: 600, cursor: "pointer",
};
function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "long", day: "numeric",
    weekday: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}
function dayKey(value: string | number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}
export default function OneDayPage() {
  const [classes, setClasses] = useState<Lesson[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [withGuest, setWithGuest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());

  async function refreshClasses() {
    const res = await fetch("/api/oneday", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "수업을 불러오지 못했습니다.");
    setClasses(json.classes || []);
  }
  async function refreshBookings(studentName: string, last4: string) {
    if (!studentName || !/^\d{4}$/.test(last4)) return;
    const params = new URLSearchParams({ name: studentName, phoneLast4: last4 });
    const res = await fetch("/api/oneday/bookings?" + params.toString(), { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || "신청 내역을 불러오지 못했습니다.");
    setBookings(json.bookings || []);
  }
  useEffect(() => {
    refreshClasses().catch((error) => setMessage(String(error.message)));
    try {
      const saved = JSON.parse(localStorage.getItem(STUDENT_KEY) || "null");
      if (saved?.name && /^\d{4}$/.test(String(saved.phone_last4 || ""))) {
        setName(saved.name);
        setPhone(saved.phone_last4);
        refreshBookings(saved.name, saved.phone_last4).catch((error) => setMessage(String(error.message)));
      }
    } catch { /* 로그인 정보가 없으면 직접 확인합니다. */ }
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  async function lookup() {
    setMessage("");
    try {
      await refreshBookings(name.trim(), phone.trim());
      localStorage.setItem(STUDENT_KEY, JSON.stringify({ name: name.trim(), phone_last4: phone.trim() }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "신청 내역을 확인하지 못했습니다."); }
  }
  async function reserve() {
    if (!selectedId || !name.trim() || !/^\d{4}$/.test(phone.trim())) {
      setMessage("정규수강생 이름과 휴대전화 번호 뒷자리 4자리를 확인해 주세요.");
      return;
    }
    setLoading(true); setMessage("");
    try {
      const res = await fetch("/api/oneday", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedId, student_name: name.trim(),
          phone_last4: phone.trim(), people_count: withGuest ? 2 : 1,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "신청할 수 없습니다.");
      localStorage.setItem(STUDENT_KEY, JSON.stringify({ name: name.trim(), phone_last4: phone.trim() }));
      setMessage(json.status === "대기" ? `대기 ${json.waitlist_position}번으로 접수되었습니다. 빈자리가 나면 순서대로 자동 확정됩니다.` : "신청이 확정되었습니다. 수업 당일에는 취소할 수 없습니다.");
      setSelectedId(""); setWithGuest(false);
      await Promise.all([refreshClasses(), refreshBookings(name.trim(), phone.trim())]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "신청에 실패했습니다."); }
    finally { setLoading(false); }
  }
  async function cancelBooking(booking: Booking) {
    if (!booking.oneday_classes || dayKey(booking.oneday_classes.start_at) <= dayKey(now)) return;
    if (!window.confirm("이 원데이 클래스 신청을 취소하시겠습니까?")) return;
    setLoading(true); setMessage("");
    try {
      const res = await fetch("/api/oneday/cancel", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, student_name: name.trim(), phone_last4: phone.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "취소할 수 없습니다.");
      setMessage("신청이 취소되었습니다.");
      await Promise.all([refreshClasses(), refreshBookings(name.trim(), phone.trim())]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "취소 중 오류가 발생했습니다."); }
    finally { setLoading(false); }
  }
  const available = classes.filter((c) => new Date(c.start_at).getTime() - now >= CUTOFF_MS);
  const selected = classes.find((c) => c.id === selectedId);
  const people = withGuest ? 2 : 1;
  return (
    <main className="container studioApp" style={{ maxWidth: 760, paddingBottom: 90 }}>
      <header style={{ margin: "20px 0 24px" }}>
        <h1 style={{ fontSize: 25, marginBottom: 8 }}>원데이 클래스</h1>
        <p style={secondary}>정규수강생과 함께 읽고, 쓰고, 새로운 경험을 나누는 시간</p>
      </header>
      {message && <div role="status" style={{ ...simpleCard, background: "#fafafa", fontSize: 14 }}>{message}</div>}
      <section style={simpleCard}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>원데이 클래스 소개 및 신청</h2>
        <p style={secondary}>정규수강생 전용 · 정원 6명(동반자 포함) · 수업 시작 3시간 전까지 신청 가능 · 마감 시 대기 접수</p>
        <p style={secondary}>가족 또는 친구를 1명 동반할 수 있습니다. 수업 당일에는 취소할 수 없습니다.</p>
        {available.length === 0 && <p style={secondary}>현재 신청 가능한 클래스가 없습니다.</p>}
        {available.map((lesson) => (
          <article key={lesson.id} style={{ borderTop: "1px solid #ededed", padding: "16px 0" }}>
            <strong style={{ display: "block", fontSize: 16 }}>{lesson.title}</strong>
            <p style={{ ...secondary, marginTop: 5 }}>{formatDate(lesson.start_at)}</p>
            {lesson.description && <p style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{lesson.description.replace(/(?:원데이 클래스 신청 후|입금 안내)[\s\S]*$/,"").trim()}</p>}
            <p style={secondary}>{lesson.remaining > 0 ? `남은 자리 ${lesson.remaining} / 6` : "정원 마감 · 대기 접수 가능"}</p>
            <button type="button" className="secondary" disabled={false}
              onClick={() => { setSelectedId(lesson.id); setWithGuest(false); }}>
              {selectedId === lesson.id ? "선택됨" : lesson.remaining < 1 ? "대기 신청하기" : "신청하기"}
            </button>
          </article>
        ))}
      </section>
      {selected && (
        <section style={simpleCard}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>신청하기</h2>
          <strong>{selected.title}</strong>
          <p style={secondary}>{formatDate(selected.start_at)}</p>
          <p style={secondary}>신청자 본인 외 동반자 1명 참석 여부</p>
          <label style={{ display: "block", padding: "7px 0" }}>
            <input type="radio" checked={!withGuest} onChange={() => setWithGuest(false)} /> 혼자 참석
          </label>
          <label style={{ display: "block", padding: "7px 0" }}>
            <input type="radio" checked={withGuest} onChange={() => setWithGuest(true)} /> 가족·친구 1명 동반 (총 2명)
          </label>
          <p style={secondary}>신청 인원 {people}명 · 동반자 포함 잔여 정원 내에서 즉시 확정</p>
          {(!name || !/^\d{4}$/.test(phone)) && <div style={{ margin: "12px 0" }}>
            <label>정규수강생 이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" />
            <label>휴대전화 번호 뒷자리 4자리</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0,4))} inputMode="numeric" maxLength={4} placeholder="0000" />
          </div>}
          <button style={primaryButton} disabled={loading} onClick={reserve}>
            {loading ? "처리 중..." : selected.remaining < people ? "대기 신청하기" : "신청 확정하기"}
          </button>
        </section>
      )}
      <section style={simpleCard}>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>내 신청 내역</h2>
        {(!name || !/^\\d{4}$/.test(phone)) && (
          <div style={{ marginBottom: 12 }}>
            <p style={secondary}>정규수강생 정보를 입력하면 신청 내역을 확인할 수 있습니다.</p>
            <label>이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" />
            <label>휴대전화 뒷자리 4자리</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\\D/g, "").slice(0, 4))} placeholder="0000" inputMode="numeric" maxLength={4} />
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button type="button" className="secondary compact" onClick={lookup}>내 신청 내역 새로고침</button>
        </div>
        {bookings.length === 0 && <p style={secondary}>확인된 신청 내역이 없습니다.</p>}
        {bookings.map((booking) => {
          const lesson = booking.oneday_classes;
          const waiting = booking.status === "대기";
          const active = ACTIVE.has(String(booking.status || "")) || waiting;
          const completed = lesson && new Date(lesson.end_at).getTime() <= now;
          const cancellable = active && lesson && dayKey(lesson.start_at) > dayKey(now);
          return (
            <div key={booking.id} style={{ borderTop: "1px solid #ededed", padding: "14px 0" }}>
              <strong>{lesson?.title || "원데이 클래스"}</strong>
              {lesson && <p style={secondary}>{formatDate(lesson.start_at)}</p>}
              <p style={secondary}>
                {booking.people_count === 2 ? "동반자 있음 · 총 2명" : "동반자 없음 · 총 1명"}
                {" · "}{!active ? "취소 완료" : waiting ? `대기 ${booking.waitlist_position || "-"}번` : completed ? "수강 완료" : "신청 확정"}
              </p>
              {cancellable && <button type="button" className="secondary compact" disabled={loading} onClick={() => cancelBooking(booking)}>신청 취소</button>}
            </div>
          );
        })}
      </section>
      <BottomNav />
    </main>
  );
}
