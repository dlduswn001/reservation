"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "../components/BottomNav";
import { disconnectPushOnLogout } from "../../lib/pushClient";
import { getRegularPassPolicyStatus } from "../../lib/passPolicy";

type Student = { id: string; name: string; phone_last4: string; lesson_credits?: number; lesson_duration_minutes?: number; pass_registered_at?: string | null; pass_first_lesson_at?: string | null; pass_expires_at?: string | null; pass_extension_used?: boolean | null; pass_extension_until?: string | null; pass_extension_reason?: string | null };
type OneDayBooking = {
  status?: string;
  amount_due?: number | null;
  oneday_classes?: { start_at?: string; end_at?: string } | null;
};

const STUDENT_LOGIN_STORAGE_KEY = "munjangStudentLogin";
const ACTIVE_ONEDAY_STATUSES = new Set(["booked", "입금대기", "등록대기", "입금완료", "등록완료"]);

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

function isThisMonthKst(value?: string) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  });
  return formatter.format(date) === formatter.format(now);
}

export default function ProfilePage() {
  const [name, setName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [freeBenefitUsed, setFreeBenefitUsed] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadFreeBenefit(studentId: string) {
    try {
      const res = await fetch(`/api/student/history?studentId=${studentId}`);
      const json = await res.json();
      if (!res.ok) return;
      const used = (json.onedayBookings || []).some((booking: OneDayBooking) => {
        const oneClass = booking.oneday_classes;
        const active = ACTIVE_ONEDAY_STATUSES.has(String(booking.status || ""));
        return active && isThisMonthKst(oneClass?.start_at) && Number(booking.amount_due ?? 0) === 0;
      });
      setFreeBenefitUsed(used);
    } catch {
      // 혜택 표시를 불러오지 못해도 프로필은 그대로 보여줍니다.
    }
  }

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
    loadFreeBenefit(json.student.id);
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
    void disconnectPushOnLogout(student);
    clearStoredStudentLogin();
    setStudent(null);
    setName("");
    setPhoneLast4("");
    setFreeBenefitUsed(false);
    setMessage("자동 로그인 정보를 지웠습니다.");
  }

  return (
    <main className="container appContainer studioApp">
      <header className="studioPageHeader"><h1>마이페이지</h1></header>

      {!student ? (
        <section className="card profileLoginCard">
          <h1>수강생 정보를 확인해 주세요.</h1>
          <p>이름과 핸드폰번호 뒷자리 4자리를 입력하면 내 정보를 확인할 수 있어요.</p>
          <label>이름</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김문장" />
          <label>핸드폰번호 뒷자리 4자리</label>
          <input value={phoneLast4} onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="예: 6789" inputMode="numeric" maxLength={4} />
          <button onClick={() => login()} disabled={loading}>{loading ? "확인 중..." : "프로필 확인하기"}</button>
        </section>
      ) : (
        <>
          <section className="card profileIdentityCard">
            <div className="profileAvatar" aria-hidden="true">문</div>
            <div>
              <h1>{student.name}님</h1>
              <p>휴대폰 뒷자리 {student.phone_last4}</p>
              <Link className="studioProfileLink" href="/history">이용내역 확인하기 →</Link>
            </div>
          </section>

          <section className="card profileInfoCard">
            <h2 className="studioProfileSectionTitle">내 이용 정보</h2>
            <div className="profileLine"><span>잔여 수강권</span><strong>{student.lesson_credits ?? 0}회</strong></div>
            <Link href="/passes" className="studioProfileLink">수강권 자세히 보기 →</Link>
            <div className="profileLine"><span>정규수업 수강권</span><strong>{Number(student.lesson_duration_minutes ?? 90) === 45 ? "45분 수강권" : Number(student.lesson_duration_minutes ?? 90) === 120 ? "120분 수강권" : "90분 수강권"}</strong></div>
            <div className="profileLine"><span>이번 달 원데이 무료 혜택</span><strong className={freeBenefitUsed ? "mutedStrong" : "greenStrong"}>{freeBenefitUsed ? "사용 완료" : "사용 가능"}</strong></div>
            {(() => {
              const passStatus = getRegularPassPolicyStatus(student);
              if (!passStatus.applies) {
                return <div className="profileLine"><span>수강권 사용기한</span><strong>정책 적용 전</strong></div>;
              }
              return (
                <>
                  <div className="profileLine"><span>수강권 등록일</span><strong>{passStatus.registeredAt || "-"}</strong></div>
                  <div className="profileLine"><span>첫 수업일</span><strong>{passStatus.firstLessonAt || "예약 후 자동 등록"}</strong></div>
                  <div className="profileLine"><span>사용기한</span><strong className={passStatus.expired ? "mutedStrong" : passStatus.expiringSoon ? "greenStrong" : ""}>{passStatus.expiresAt || "첫 수업일 기준 산정"}</strong></div>
                  <p className="small">8월 1일 이후 결제 및 재등록한 4회 수강권은 첫 수업일로부터 10주 이내 사용을 안내드립니다. 필요 시 관리자 판단에 따라 1주 단위로 연장할 수 있습니다.</p>
                </>
              );
            })()}
            <div className="profileLine"><span>회원 구분</span><strong>정규 수강생</strong></div>
            <div className="profileActions">
              <button type="button" className="sageButton" onClick={logout}>로그아웃</button>
              <button type="button" className="secondary outlineButton" onClick={logout}>다른 수강생으로 로그인</button>
            </div>
          </section>
        </>
      )}
      {message && <p className={student ? "success" : "error"}>{message}</p>}
      <BottomNav />
    </main>
  );
}
