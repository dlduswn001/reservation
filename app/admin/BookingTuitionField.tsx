"use client";

import { useState } from "react";
import BookingTuitionEditor from "./BookingTuitionEditor";
import { bookingOrigin, lessonFee } from "../../lib/bookingRevenue";
import { defaultBookingTuition } from "../../lib/bookingTuition";
import type { LessonBooking, LessonTuition } from "../../lib/bookingRevenue";
import type { BookingTuition } from "../../lib/bookingTuition";

type Props = {
  booking: LessonBooking;
  tuition?: LessonTuition | null;
  password: string;
  onSaved?: (tuition: BookingTuition) => void;
};

export default function BookingTuitionField({ booking, tuition, password, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const origin = bookingOrigin(booking);
  const amount = lessonFee(booking, tuition);
  const automatic = tuition ? defaultBookingTuition(tuition.student_minutes ?? null, Number(tuition.lesson_minutes)) : null;
  const manuallyAdjusted = origin === "student" && amount !== null && automatic !== null && amount !== automatic;

  if (origin === "admin") {
    return <BookingTuitionEditor bookingId={booking.id} password={password} onSaved={onSaved} />;
  }

  return (
    <div className="adminAutoTuition" style={{ marginTop: 9, paddingTop: 8, borderTop: "1px solid #efe7e9", fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: "#70293f", fontWeight: 800 }}>
          {manuallyAdjusted ? "수정한 수강료 " : origin === "student" ? "수강료 " : "수강료 "}
          {amount === null ? "금액 미정" : amount.toLocaleString("ko-KR") + "원"}
        </span>
        <button type="button" className="secondary compact" aria-expanded={editing}
          onClick={() => setEditing(value => !value)} style={{ margin: 0, padding: "7px 11px", fontSize: 12 }}>
          {editing ? "수정 닫기" : "금액 수정"}
        </button>
      </div>
      <span style={{ display: "block", color: "#80777b", marginTop: 3, fontSize: 12 }}>
        {origin === "student" ? "수강생 예약" : "예약 출처 확인 필요"}
        {" · "}{tuition?.confirmed_at ? "입금 확인됨" : "입금 미확인"}
        {amount === null ? " · 직접 금액 확인 필요" : ""}
      </span>
      {editing && <BookingTuitionEditor bookingId={booking.id} password={password}
        suggestedAmount={amount} onSaved={saved => {
          onSaved?.(saved);
          setEditing(false);
        }} />}
    </div>
  );
}
