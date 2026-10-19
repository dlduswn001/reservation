"use client";

import BookingTuitionEditor from "./BookingTuitionEditor";
import { bookingOrigin, lessonFee } from "../../lib/bookingRevenue";
import type { LessonBooking, LessonTuition } from "../../lib/bookingRevenue";
import type { BookingTuition } from "../../lib/bookingTuition";

type Props = {
  booking: LessonBooking;
  tuition?: LessonTuition | null;
  password: string;
  onSaved?: (tuition: BookingTuition) => void;
};

export default function BookingTuitionField({ booking, tuition, password, onSaved }: Props) {
  const origin = bookingOrigin(booking);
  if (origin === "admin") {
    return <BookingTuitionEditor bookingId={booking.id} password={password} onSaved={onSaved} />;
  }
  const amount = lessonFee(booking, tuition);
  return (
    <div className="adminAutoTuition" style={{ marginTop: 9, paddingTop: 8, borderTop: "1px solid #efe7e9", fontSize: 13 }}>
      <span style={{ color: "#70293f", fontWeight: 800 }}>
        {origin === "student" ? "자동 수강료 " : "수강료 "}
        {amount === null ? "금액 미정" : amount.toLocaleString("ko-KR") + "원"}
      </span>
      <span style={{ display: "block", color: "#80777b", marginTop: 3, fontSize: 12 }}>
        {origin === "student" ? "수강생 직접 예약 · " : "예약 유형 확인 필요 · "}
        {tuition?.confirmed_at ? "입금 확인됨" : "입금 미확인"}
        {amount === null ? " · 비정형 수업은 금액 확인 필요" : ""}
      </span>
    </div>
  );
}
