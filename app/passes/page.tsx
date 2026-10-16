"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Ticket } from "lucide-react";
import BottomNav from "../components/BottomNav";
import { getRegularPassPolicyStatus } from "../../lib/passPolicy";

type Student = {
  id: string; name: string; phone_last4: string; lesson_credits?: number; lesson_duration_minutes?: number;
  pass_registered_at?: string | null; pass_first_lesson_at?: string | null; pass_expires_at?: string | null;
  pass_extension_until?: string | null; pass_extension_used?: boolean | null; pass_extension_reason?: string | null;
};

export default function PassesPage() {
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const raw = window.localStorage.getItem("munjangStudentLogin");
        const saved = raw ? JSON.parse(raw) as { name?: string; phone_last4?: string } : null;
        if (!saved?.name || !/^\d{4}$/.test(String(saved.phone_last4 || ""))) return;
        const response = await fetch("/api/student/login", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: saved.name, phone_last4: saved.phone_last4 }),
        });
        if (response.ok) {
          const result = await response.json();
          setStudent(result.student);
        }
      } catch {
        // 로그인 기록이 없거나 읽기에 실패하면 마이페이지로 안내합니다.
      } finally { setLoading(false); }
    }
    load();
  }, []);

  const pass = student ? getRegularPassPolicyStatus(student) : null;
  const duration = Number(student?.lesson_duration_minutes ?? 90);

  return (
    <main className="container appContainer studentPassesPage">
      <header className="appHeader"><strong>수강권</strong></header>
      <div className="pageLead"><h1>나의 수강권</h1><p>사용 가능한 횟수와 수강기간을 확인해요.</p></div>
      {student ? (
        <>
          <section className="studentPassTicket" aria-label="정규수강권 정보">
            <div className="studentPassTicketTop"><span><Ticket size={19}/> 정규 1:1 글쓰기</span><span className="studentPassChip">사용 중</span></div>
            <h2>{duration}분 정규수강권</h2>
            <div className="studentPassTicketCredits"><strong>{student.lesson_credits ?? 0}</strong><span>회 남음</span></div>
            <div className="studentPassTicketBottom"><span>사용기한</span><strong>{pass?.applies ? pass.expiresAt || "첫 수업일 기준 산정" : "개별 안내"}</strong></div>
          </section>
          <section className="passDetailCard"><h2>수강권 이용 정보</h2>
            <div><span>수강생</span><strong>{student.name}님</strong></div>
            <div><span>첫 수업일</span><strong>{pass?.firstLessonAt || "미등록"}</strong></div>
            <div><span>사용기한</span><strong>{pass?.applies ? pass?.expiresAt || "첫 수업일부터 산정" : "정책 적용 전"}</strong></div>
            <div><span>상태</span><strong>{pass?.label || "사용 가능"}</strong></div>
          </section>
          <Link href="/book" className="passBookingLink"><CalendarDays size={19}/> 수업 예약하기 <ArrowRight size={18}/></Link>
        </>
      ) : (
        <section className="passLoginCard"><Ticket size={30} aria-hidden="true"/><h2>{loading ? "수강권 정보를 확인하고 있어요." : "수강생 로그인 후 확인할 수 있어요."}</h2><p>마이페이지에서 이름과 휴대폰 번호 뒷자리로 로그인해 주세요.</p><Link href="/profile" className="button">마이페이지로 이동 <ArrowRight size={16}/></Link></section>
      )}
      <p className="passFinePrint">4회 정규수강권의 사용기간은 첫 수업일로부터 10주입니다. 수강권 적용 여부와 연장 내역은 개인별로 다를 수 있어요.</p>
      <BottomNav />
    </main>
  );
}
