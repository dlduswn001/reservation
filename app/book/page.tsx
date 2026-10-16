import Link from "next/link";
import { ArrowRight, BookOpenText, CalendarDays, Clock3 } from "lucide-react";
import BottomNav from "../components/BottomNav";

export default function BookPage() {
  return (
    <main className="container appContainer studentBookingLanding">
      <header className="appHeader"><strong>수업예약</strong></header>
      <div className="pageLead"><h1>어떤 수업을 예약할까요?</h1><p>문장학교에서 나만의 글쓰기 시간을 예약하세요.</p></div>
      <section className="studentBookingChoices">
        <Link className="studentBookingChoice" href="/regular"><span className="studentChoiceIcon"><CalendarDays size={24} /></span><span><strong>정규 1:1 글쓰기</strong><small>45분·90분 정규수업 및 생활수업</small></span><ArrowRight size={20} className="studentChoiceArrow" /></Link>
        <Link className="studentBookingChoice" href="/oneday"><span className="studentChoiceIcon"><BookOpenText size={24} /></span><span><strong>원데이 클래스</strong><small>함께 배우고 쓰는 월간 클래스</small></span><ArrowRight size={20} className="studentChoiceArrow" /></Link>
      </section>
      <section className="studentBookingNotice"><div className="sectionTitleRow"><h2><Clock3 size={20}/> 예약 안내</h2></div><p>수업 신청은 시작 3시간 전까지 가능합니다.</p><p>시작 3시간 전까지 취소하면 수강권이 복구됩니다. 이후 취소 시에는 차감됩니다.</p><p>4회 정규수강권은 첫 수업일로부터 10주 동안 사용할 수 있습니다.</p></section>
      <BottomNav />
    </main>
  );
}
