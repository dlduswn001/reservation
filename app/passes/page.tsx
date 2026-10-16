"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Ticket, CalendarDays } from "lucide-react";
import BottomNav from "../components/BottomNav";
import { getRegularPassPolicyStatus } from "../../lib/passPolicy";

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

export default function PassesPage() {
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const raw = window.localStorage.getItem("munjangStudentLogin");
        if (!raw) return;
        const saved = JSON.parse(raw) as {name?: string; phone_last4?: string};
        if (!saved.name || !/^\d{4}$/.test(String(saved.phone_last4 || ""))) return;
        const res = await fetch("/api/student/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: saved.name, phone_last4: saved.phone_last4 }),
          cache: "no-store",
        });
        const json = await res.json();
        if (res.ok && json.student) setStudent(json.student);
      } catch {
        // 로그인 정보가 없어도 수강권 화면에서 안내를 볼 수 있습니다.
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const duration = Number(student?.lesson_duration_minutes || 90);
  const durationName = duration === 120 ? "120분" : duration === 45 ? "45분" : "90분";
  const pass = student ? getRegularPassPolicyStatus(student) : null;

  return (
    <main className="container appContainer studioApp">
      <header className="studioPageHeader"><h1>수강권</h1></header>
      {loading ? (
        <section className="studioEmpty">수강권 정보를 불러오고 있어요.</section>
      ) : !student ? (
        <section className="studioBlankCard">
          <Ticket size={32} strokeWidth={1.6}/>
          <h2>나의 수강권을 확인해 보세요.</h2>
          <p>마이페이지에서 로그인하면 남은 횟수와 사용기한을 확인할 수 있어요.</p>
          <Link href="/profile" className="studioTextButton">수강생 로그인 <ArrowRight size={16}/></Link>
        </section>
      ) : (
        <>
          <p className="studioPassLabel">{student.name}님의 수강권</p>
          <section className="studioTicketCard" aria-label="보유 중인 정규수강권">
            <span className="studioTicketStatus">사용 중</span>
            <span className="studioTicketType">문장학교 · 1:1 글쓰기</span>
            <h2>{durationName} 정규수강권</h2>
            <p>나만의 문장을 쓰는 시간</p>
            <div className="studioTicketBalance">
              <span>잔여 수강권</span>
              <strong>{student.lesson_credits ?? 0}회</strong>
            </div>
          </section>

          <section className="studioSection studioPassDetails">
            <h2>수강권 이용 정보</h2>
            <div className="studioDetailRows">
              <div><span>수업 길이</span><strong>{durationName}</strong></div>
              <div><span>첫 수업일</span><strong>{pass?.applies ? (pass.firstLessonAt || "첫 예약 후 산정") : "정책 적용 전"}</strong></div>
              <div><span>사용기한</span><strong>{pass?.applies ? (pass.expiresAt || "첫 수업일 기준") : "정책 적용 전"}</strong></div>
            </div>
            <p className="studioFootnote">4회 정규수강권은 첫 수업일부터 10주 동안 사용할 수 있습니다. 수강권 연장은 관리자에게 문의해 주세요.</p>
          </section>

          <Link className="studioFullLink" href={duration === 120 ? "/regular" : "/book"}>
            <CalendarDays size={20}/> {duration === 120 ? "120분 수업 일정 문의하기" : "수업 예약하기"} <ArrowRight size={18}/>
          </Link>
        </>
      )}
      <BottomNav />
    </main>
  );
}
