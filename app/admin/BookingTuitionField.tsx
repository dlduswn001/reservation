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

/** A prepaid pass has already been paid. Only manager-entered classes need a payment editor. */
export default function BookingTuitionField({ booking, tuition, password, onSaved }: Props) {
  if (bookingOrigin(booking) === "admin") {
    return <BookingTuitionEditor bookingId={booking.id} password={password} onSaved={onSaved} />;
  }
  const amount = lessonFee(booking, tuition);
  return <div className="adminAutoTuition" style={{ marginTop: 9, paddingTop: 8, borderTop: "1px solid #efe7e9", fontSize: 13 }}>
    <strong style={{color:"#70293f"}}>수강료 {amount === null ? "금액 미정" : amount.toLocaleString("ko-KR") + "원"}</strong>
  </div>;
}
