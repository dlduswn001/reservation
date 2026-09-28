"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BottomNav from "../components/BottomNav";
import { bookingDisplayNameFromMemo } from "../../lib/businessRules";

type Student = { id: string; name: string; phone_last4: string; lesson_credits?: number };
type Booking = { id: string; start_at: string; end_at: string; status: string; memo?: string };
type OneDayBooking = {
  id: string;
  status?: string;
  amount_due?: number | null;
  oneday_classes?: { id: string; title: string; start_at: string; end_at: string } | null;
};
type ScheduleItem = { id: string; date: string; kind: string; title: string; time: string; status: string };

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(value));
}

function formatTimeRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    booked: "예약 완료",
    cancelled: "취소 완료",
    late_cancelled: "3시간 이내 취소",
    done: "수강 완료",
    "입금대기": "입금 대기",
    "등록대기": "무료 등록 대기",
    "입금완료": "등록 완료",
    "등록완료": "등록 완료",
  };
  return labels[String(status || "")] || status || "-";
}

function dateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function monthLabel(key: string) {
  const [year, month] = key.split("-");
  return `${year}년 ${Number(month)}월`;
}

export default function SchedulePage() {
  const [student, setStudent] = useState<Student | null>(null);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = readStoredStudentLogin();
    if (!saved) {
      setMessage("프로필에서 먼저 로그인하면 내 일정표를 확인할 수 있습니다.");
      return;
    }

    async function loadSchedule() {
      const loginRes = await fetch("/api/student/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saved!.name, phone_last4: saved!.phone_last4 }),
      });
      const loginJson = await loginRes.json();
      if (!loginRes.ok) {
        setMessage(loginJson.message || "수강생 정보를 찾을 수 없습니다.");
        return;
      }
      setStudent(loginJson.student);

      const historyRes = await fetch(`/api/student/history?studentId=${loginJson.student.id}`);
      const historyJson = await historyRes.json();
      if (!historyRes.ok) {
        setMessage(historyJson.message || "일정표를 불러올 수 없습니다.");
        return;
      }

      const regularItems = (historyJson.bookings || [])
        .filter((booking: Booking) => ["booked", "done", "late_cancelled"].includes(String(booking.status || "")))
        .map((booking: Booking) => {
          const className = bookingDisplayNameFromMemo(booking.memo);
          return {
            id: `regular-${booking.id}`,
            date: booking.start_at,
            kind: className === "정규수업" ? "정규수업" : "생활수업",
            title: className,
            time: formatTimeRange(booking.start_at, booking.end_at),
            status: statusLabel(booking.status),
          };
        });

      const onedayItems = (historyJson.onedayBookings || [])
        .filter((booking: OneDayBooking) => booking.oneday_classes && ACTIVE_ONEDAY_STATUSES.has(String(booking.status || "")))
        .map((booking: OneDayBooking) => ({
          id: `oneday-${booking.id}`,
          date: booking.oneday_classes!.start_at,
          kind: "원데이",
          title: booking.oneday_classes!.title,
          time: formatTimeRange(booking.oneday_classes!.start_at, booking.oneday_classes!.end_at),
          status: statusLabel(booking.status),
        }));

      setItems([...regularItems, ...onedayItems].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    }

    loadSchedule();
  }, []);

  const grouped = useMemo(() => {
    const groups = new Map<string, ScheduleItem[]>();
    for (const item of items) {
      const key = dateKey(item.date).slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return Array.from(groups.entries()).map(([key, groupItems]) => ({ key, label: monthLabel(key), items: groupItems }));
  }, [items]);

  return (
    <main className="container appContainer">
      <section className="card">
        <h1>내 일정표</h1>
        <p>{student ? `${student.name}님의 정규수업과 원데이 클래스 일정을 월별로 확인할 수 있습니다.` : "로그인 후 내 일정을 확인할 수 있습니다."}</p>
        {message && <p className="error">{message}</p>}
        {!student && <Link className="button" href="/profile">프로필에서 로그인하기</Link>}
      </section>

      {student && (
        <section className="card">
          {grouped.length === 0 && <p>표시할 일정이 없습니다.</p>}
          {grouped.map((group) => (
            <div className="scheduleMonth" key={group.key}>
              <h2>{group.label}</h2>
              <div className="list">
                {group.items.map((item) => (
                  <div className="scheduleItem" key={item.id}>
                    <div>
                      <span className="scheduleKind">{item.kind}</span>
                      <strong>{item.title}</strong>
                      <p>{formatDate(item.date)} · {item.time}</p>
                    </div>
                    <em>{item.status}</em>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
      <BottomNav />
    </main>
  );
}
