"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "./components/BottomNav";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

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
        .map((booking: any) => ({
          label: "정규수업",
          title: "정규수업",
          time: formatDateTime(booking.start_at),
          rawDate: booking.start_at,
          status: "예약 완료",
        }));

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
    <main className="container appContainer">
      <header className="appHeader">
        <strong>문장학교 예약 앱</strong>
        <span aria-hidden="true">♧</span>
      </header>

      <section className="heroCard brandHero">
        <p className="eyebrow">문장학교 예약 앱</p>
        <h1>{student ? `안녕하세요, ${student.name}님.` : "안녕하세요, 문장학교님."}</h1>
        <p>{student ? `잔여 수강권: ${student.lesson_credits ?? 0}회` : "정규수업과 원데이 클래스를 편하게 예약할 수 있어요."}</p>
      </section>

      <section className="card homeCard">
        <div className="sectionTitleRow">
          <h2>다가오는 수업</h2>
          <Link className="textLink" href="/history">더보기 ›</Link>
        </div>
        <div className="list">
          {upcoming.length === 0 && <p>현재 표시할 다가오는 수업이 없습니다.</p>}
          {upcoming.map((item, index) => (
            <div className="miniScheduleItem" key={`${item.label}-${index}`}>
              <span>{item.label}</span>
              <strong>{item.title}</strong>
              <p>{item.time} · {item.status}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card homeCard">
        <h2>예약하기</h2>
        <div className="menu appMenu">
          <Link className="button" href="/regular">정규수업 예약하기</Link>
          <Link className="button secondary" href="/oneday">원데이 클래스 신청하기</Link>
        </div>
      </section>

      <PWAInstallPrompt />
      <BottomNav />
    </main>
  );
}
