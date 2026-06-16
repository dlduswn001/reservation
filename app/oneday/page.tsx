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

function formatPrice(value?: number) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

export default function OneDayPage() {
  const [classes, setClasses] = useState<OneDayClass[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [name, setName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [peopleCount, setPeopleCount] = useState(1);
  const [isRegularStudent, setIsRegularStudent] = useState(false);
  const [message, setMessage] = useState("");

  async function loadClasses() {
    const res = await fetch("/api/oneday");
    const json = await res.json();
    setClasses(json.classes || []);
  }

  useEffect(() => { loadClasses(); }, []);

  async function reserve() {
    setMessage("");
    const res = await fetch("/api/oneday", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId: selected,
        student_name: name,
        phone_last4: phoneLast4,
        people_count: peopleCount,
        is_regular_student: isRegularStudent,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.message || "신청할 수 없습니다.");
      return;
    }
    setMessage("원데이 클래스 신청이 완료되었습니다.");
    setName(""); setPhoneLast4(""); setPeopleCount(1); setSelected("");
    await loadClasses();
  }

  return (
    <main className="container">
      <Link href="/" className="small">← 처음으로</Link>
      <section className="card">
        <h1>원데이 클래스 예약</h1>
        <p>개설된 원데이 클래스를 선택해 신청할 수 있습니다. 각 클래스의 제목, 커리큘럼, 수업 일정, 비용을 확인한 뒤 신청해 주세요.</p>
        {message && <p className={message.includes("완료") ? "success" : "error"}>{message}</p>}
      </section>

      <section className="card">
        <h2>개설 클래스</h2>
        <div className="list">
          {classes.length === 0 && <p>현재 신청 가능한 원데이 클래스가 없습니다.</p>}
          {classes.map((c) => (
            <div className="item" key={c.id}>
              <strong>{c.title}</strong>
              <p>{formatDateTime(c.start_at)} - {formatDateTime(c.end_at)}</p>
              <p className="small">남은 자리: {c.remaining}명 / 정원: 5명</p>
              <p className="small">비용: 정규생 {formatPrice(c.regular_price)} / 일반 {formatPrice(c.normal_price)}</p>
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
        <input value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value)} maxLength={4} />
        <label>참여 인원</label>
        <input type="number" min={1} max={5} value={peopleCount} onChange={(e) => setPeopleCount(Number(e.target.value))} />
        <label className="row"><input style={{ width: "auto" }} type="checkbox" checked={isRegularStudent} onChange={(e) => setIsRegularStudent(e.target.checked)} /> 정규 수강생입니다</label>
        <button onClick={reserve}>신청하기</button>
      </section>
    </main>
  );
}
