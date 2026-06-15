"use client";

import { useState } from "react";
import Link from "next/link";

type Overview = {
  students: any[];
  slots: any[];
  bookings: any[];
  classes: any[];
  onedayBookings: any[];
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

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState("");
  const [studentName, setStudentName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [memo, setMemo] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  async function loadOverview() {
    setMessage("");
    const res = await fetch("/api/admin/overview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "관리자 페이지에 들어갈 수 없습니다.");
      return;
    }
    setOverview(json);
  }

  async function addStudent() {
    setMessage("");
    const res = await fetch("/api/admin/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, name: studentName, phone_last4: phoneLast4, memo }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "수강생을 등록할 수 없습니다.");
      return;
    }
    setStudentName(""); setPhoneLast4(""); setMemo("");
    setMessage("수강생을 등록했습니다.");
    await loadOverview();
  }

  async function addSlot() {
    setMessage("");
    const res = await fetch("/api/admin/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, start_at: startAt, end_at: endAt }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "예약 가능 시간을 등록할 수 없습니다.");
      return;
    }
    setStartAt(""); setEndAt("");
    setMessage("예약 가능 시간을 등록했습니다.");
    await loadOverview();
  }

  return (
    <main className="container">
      <Link href="/" className="small">← 처음으로</Link>
      <section className="card">
        <h1>관리자 페이지</h1>
        <p>관리자 비밀번호를 입력해 주세요. 처음 테스트 비밀번호는 1234로 설정하면 됩니다.</p>
        <label>관리자 비밀번호</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="관리자 비밀번호" />
        <button onClick={loadOverview}>관리자 페이지 열기</button>
        {message && <p className={message.includes("등록") ? "success" : "error"}>{message}</p>}
      </section>

      {overview && (
        <>
          <section className="card">
            <h2>정규 수강생 등록</h2>
            <label>이름</label>
            <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="예: 테스트학생" />
            <label>핸드폰번호 뒷자리 4자리</label>
            <input value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value)} placeholder="예: 1234" maxLength={4} />
            <label>메모</label>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 테스트용" />
            <button onClick={addStudent}>수강생 등록</button>
          </section>

          <section className="card">
            <h2>예약 가능 시간 등록</h2>
            <label>시작 시간</label>
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            <label>종료 시간</label>
            <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            <button onClick={addSlot}>시간 등록</button>
          </section>

          <section className="card">
            <h2>수강생 목록</h2>
            <div className="list">
              {overview.students.map((s) => (
                <div className="item" key={s.id}><strong>{s.name}</strong> / {s.phone_last4}<p className="small">{s.memo}</p></div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>예약 가능 시간 목록</h2>
            <div className="list">
              {overview.slots.map((slot) => (
                <div className="item" key={slot.id}><strong>{formatDateTime(slot.start_at)}</strong><p className="small">종료: {formatDateTime(slot.end_at)} / 열림: {String(slot.is_open)}</p></div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>정규수업 예약 목록</h2>
            <div className="list">
              {overview.bookings.map((b) => (
                <div className="item" key={b.id}>
                  <strong>{b.students?.name || "이름 없음"}</strong>
                  <p>{formatDateTime(b.start_at)} / 상태: {b.status}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
