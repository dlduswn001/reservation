"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
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
  const [homeNotices, setHomeNotices] = useState<{id:string; title:string}[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/announcements",{cache:"no-store"})
      .then(async response => {
        if(!response.ok) throw new Error("Could not load notices");
        return response.json();
      })
      .then(json => {
        const notices = Array.isArray(json.notices) ? json.notices : [];
        const pinned = notices.filter((notice:{is_pinned?:boolean}) => notice.is_pinned);
        if (active) setHomeNotices(pinned.length ? pinned : notices.slice(0, 1));
      }).catch(() => {/* Notices remain navigable when the API is unavailable. */});
    return () => {active=false;};
  }, []);

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
          label: booking.oneday_classes?.class_kind === "freewriting" ? "프리 라이팅" : "원데이",
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

  const quickRowStyle: CSSProperties = {
    display:"grid",gridTemplateColumns:"28px 96px minmax(0,1fr) 17px",
    alignItems:"center",columnGap:9,minHeight:67,padding:"14px 13px",
    color:"#29252a",textDecoration:"none"
  };
  const quickDetailStyle: CSSProperties = {
    fontSize:12,color:"#7a7276",whiteSpace:"nowrap",
    overflow:"hidden",textOverflow:"ellipsis",textAlign:"right",minWidth:0
  };

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


      <section aria-label="문장학교 주요 메뉴" style={{
        marginTop:20,background:"#fff",border:"1px solid #ece7ea",
        borderRadius:21,overflow:"hidden"
      }}>
        <Link href="/regular" style={quickRowStyle} aria-label="수업예약 열기">
          <PenLine size={21} strokeWidth={1.8} color="#803149"/>
          <strong style={{fontSize:15,whiteSpace:"nowrap"}}>수업예약</strong>
          <span aria-hidden="true" />
          <ChevronRight size={17} color="#aa9ba2"/>
        </Link>
        <div style={{height:1,background:"#f0e9ec",margin:"0 13px"}}/>
        <Link href="/notices" style={{
          ...quickRowStyle, gridTemplateColumns:"28px minmax(0,1fr) 17px", rowGap:8
        }}>
          <Bell size={21} strokeWidth={1.8} color="#803149" aria-hidden="true"/>
          <strong style={{fontSize:15}}>공지사항</strong>
          <ChevronRight size={17} color="#aa9ba2" aria-hidden="true"/>
          {homeNotices.length > 0 && (
            <ul style={{
              gridColumn:"2 / -1", margin:0, padding:0, listStyle:"none",
              display:"grid", gap:7, color:"#51454a", fontSize:14, lineHeight:1.55
            }}>
              {homeNotices.map(notice => (
                <li key={notice.id} style={{
                  display:"grid", gridTemplateColumns:"4px minmax(0,1fr)", gap:8,
                  wordBreak:"keep-all", overflowWrap:"anywhere"
                }}>
                  <span aria-hidden="true" style={{
                    width:4, height:4, marginTop:"0.65em", borderRadius:"50%", background:"#a85b70"
                  }}/>
                  <span>{notice.title}</span>
                </li>
              ))}
            </ul>
          )}
        </Link>
        <div style={{height:1,background:"#f0e9ec",margin:"0 13px"}}/>
        <Link href="/history" style={quickRowStyle} aria-label="다가오는 수업 확인하기">
          <CalendarDays size={21} strokeWidth={1.8} color="#803149"/>
          <strong style={{fontSize:15,whiteSpace:"nowrap"}}>다가오는 수업</strong>
          <span style={quickDetailStyle}>
            {upcoming.length ? upcoming[0].time + " · " + upcoming[0].title : "예정된 수업 없음"}
          </span>
          <ChevronRight size={17} color="#aa9ba2"/>
        </Link>
      </section>

      <PWAInstallPrompt />
      <BottomNav />
    </main>
  );
}
