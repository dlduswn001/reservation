"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, PenLine, UserRound, BookOpenText, Bell } from "lucide-react";
import BottomNav from "./components/BottomNav";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import { bookingDisplayNameFromMemo } from "../lib/businessRules";

type Student = { id: string; name: string; phone_last4: string; lesson_credits?: number };
type UpcomingSummary = { label: string; title: string; time: string; rawDate: string; status?: string };

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

function onedayStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    booked: "입금 대기",
    "입금대기": "입금 대기",
    "등록대기": "무료 등록 대기",
    "입금완료": "등록 완료",
    "등록완료": "등록 완료",
  };
  return labels[String(status || "")] || status || "-";
}

export default function Home() {
  const [student, setStudent] = useState<Student | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingSummary[]>([]);

  useEffect(() => {
    const saved = readStoredStudentLogin();
    if (!saved) return;

    async function loadHome() {
      const loginRes = await fetch("/api/student/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saved!.name, phone_last4: saved!.phone_last4 }),
      });
      const loginJson = await loginRes.json();
      if (!loginRes.ok) return;
      setStudent(loginJson.student);

      const historyRes = await fetch(`/api/student/history?studentId=${loginJson.student.id}`);
      const historyJson = await historyRes.json();
      if (!historyRes.ok) return;

      const now = Date.now();
      const regular = (historyJson.bookings || [])
        .filter((booking: any) => booking.status === "booked" && new Date(booking.end_at).getTime() > now)
        .map((booking: any) => {
          const className = bookingDisplayNameFromMemo(booking.memo);
          return {
            label: className === "정규수업" ? "정규수업" : "생활수업",
            title: className,
            time: formatDateTime(booking.start_at),
            rawDate: booking.start_at,
            status: "예약 완료",
          };
        });

      const oneday = (historyJson.onedayBookings || [])
        .filter((booking: any) => {
          const oneClass = booking.oneday_classes;
          const active = ["booked", "입금대기", "등록대기", "입금완료", "등록완료"].includes(String(booking.status || ""));
          return oneClass && active && new Date(oneClass.end_at).getTime() > now;
        })
        .map((booking: any) => ({
          label: "원데이",
          title: booking.oneday_classes?.title || "원데이 클래스",
          time: formatDateTime(booking.oneday_classes?.start_at),
          rawDate: booking.oneday_classes?.start_at,
          status: onedayStatusLabel(booking.status),
        }));

      setUpcoming([...regular, ...oneday]
        .sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime())
        .slice(0, 3));
    }

    loadHome();
  }, []);

  return (
    <main className="container appContainer studioApp">
      <header className="studioHeader">
        <div className="studioWordmark">문장학교</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <Link href="/notifications" className="studioIconLink" aria-label="알림 설정과 알림 내역"><Bell size={23} strokeWidth={1.8}/></Link>
          <Link href="/profile" className="studioIconLink" aria-label="마이페이지로 이동"><UserRound size={23} strokeWidth={1.8} /></Link>
        </div>
      </header>


      <section className="studioPassOverview" aria-label="수강권 요약">
        <div>
          <span className="studioCardKicker">MY CLASS PASS</span>
          <h2>나의 수강권</h2>
          {student ? <p><strong>{student.lesson_credits ?? 0}</strong>회 남아 있어요</p> : <p>로그인하면 수강권 정보를 확인할 수 있어요.</p>}
        </div>
        <Link href={student ? "/passes" : "/profile"} aria-label="수강권 확인하기" className="studioCircleArrow"><ChevronRight size={23}/></Link>
      </section>

      <section className="studioSection">
        <div className="studioSectionHeading">
          <h2>수업 예약</h2>
          <Link href="/book" className="studioMore">전체 보기 <ChevronRight size={17} /></Link>
        </div>
        <div className="studioQuickGrid">
          <Link href="/regular" className="studioQuickLink">
            <span className="studioQuickIcon"><PenLine size={24} strokeWidth={1.8}/></span>
            <strong>정규수업</strong>
            <small>45분 · 90분 1:1</small>
            <ChevronRight className="studioQuickArrow" size={17} />
          </Link>
          <Link href="/oneday" className="studioQuickLink">
            <span className="studioQuickIcon"><BookOpenText size={24} strokeWidth={1.8}/></span>
            <strong>원데이 클래스</strong>
            <small>함께 읽고 쓰는 시간</small>
            <ChevronRight className="studioQuickArrow" size={17} />
          </Link>
        </div>
      </section>

      <section className="studioSection">
        <div className="studioSectionHeading">
          <h2>다가오는 수업</h2>
          <Link href="/history" className="studioMore">전체 보기 <ChevronRight size={17}/></Link>
        </div>
        <div className="studioScheduleList">
          {upcoming.length === 0 && (
            <div className="studioEmpty">
              <CalendarDays size={29} strokeWidth={1.45}/>
              <strong>예정된 수업이 없어요</strong>
              <p>예약한 수업이 생기면 이곳에서 확인할 수 있어요.</p>
            </div>
          )}
          {upcoming.map((item, index) => (
            <div className="studioScheduleRow" key={`${item.label}-${index}`}>
              <div className="studioScheduleTop"><span>{item.label}</span><small>{item.status}</small></div>
              <strong>{item.title}</strong>
              <p>{item.time}</p>
            </div>
          ))}
        </div>
      </section>

      <PWAInstallPrompt />
      <BottomNav />
    </main>
  );
}
