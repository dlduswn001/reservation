"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "../components/BottomNav";

type Student = { id: string; name: string; phone_last4: string; lesson_credits?: number; lesson_duration_minutes?: number };

const STUDENT_LOGIN_STORAGE_KEY = "munjangStudentLogin";

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
    // 무시
  }
}

function clearStoredStudentLogin() {
  try {
    window.localStorage.removeItem(STUDENT_LOGIN_STORAGE_KEY);
  } catch {
    // 무시
  }
}

export default function ProfilePage() {
  const [name, setName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(customName?: string, customPhoneLast4?: string) {
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
      setMessage(json.message || "수강생 정보를 찾을 수 없습니다.");
      return;
    }

    setStudent(json.student);
    setName(json.student.name);
    setPhoneLast4(json.student.phone_last4);
    saveStoredStudentLogin(json.student);
  }

  useEffect(() => {
    const saved = readStoredStudentLogin();
    if (saved) {
      setName(saved.name);
      setPhoneLast4(saved.phone_last4);
      login(saved.name, saved.phone_last4);
    }
  }, []);

  function logout() {
    clearStoredStudentLogin();
    setStudent(null);
    setName("");
    setPhoneLast4("");
    setMessage("자동 로그인 정보를 지웠습니다.");
  }

  return (
    <main className="container appContainer">
      <section className="card">
        <h1>프로필</h1>
        {!student ? (
          <div>
            <p>수강생 정보를 확인하려면 이름과 핸드폰번호 뒷자리 4자리를 입력해 주세요.</p>
            <label>이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김문장" />
            <label>핸드폰번호 뒷자리 4자리</label>
            <input value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="예: 6789" inputMode="numeric" maxLength={4} />
            <button onClick={() => login()} disabled={loading}>{loading ? "확인 중..." : "프로필 확인하기"}</button>
          </div>
        ) : (
          <div className="profileGrid">
            <div className="profileLine"><span>이름</span><strong>{student.name}</strong></div>
            <div className="profileLine"><span>휴대폰 뒷자리</span><strong>{student.phone_last4}</strong></div>
            <div className="profileLine"><span>잔여 수강권</span><strong>{student.lesson_credits ?? 0}회</strong></div>
            <div className="profileActions">
              <Link className="button secondary" href="/history">예약내역 보기</Link>
              <button type="button" className="danger" onClick={logout}>로그아웃</button>
            </div>
          </div>
        )}
        {message && <p className={student ? "success" : "error"}>{message}</p>}
      </section>
      <BottomNav />
    </main>
  );
}
