import Link from "next/link";
import { BookOpenText, CalendarDays, ChevronRight, Clock3, PenLine } from "lucide-react";
import BottomNav from "../components/BottomNav";

export default function BookPage() {
  return (
    <main className="container appContainer studioApp">
      <header className="studioPageHeader"><h1>수업예약</h1></header>
      <p className="studioPageDescription">오늘의 마음에 맞는 글쓰기 시간을 선택해 주세요.</p>
      <section className="studioBookingOptions">
        <Link className="studioBookingOption" href="/regular">
          <div className="studioOptionIcon"><CalendarDays size={27} strokeWidth={1.7}/></div>
          <div>
            <span>REGULAR CLASS</span>
            <h2>정규 1:1 글쓰기</h2>
            <p>45분 · 90분 수업을 예약해요.</p>
          </div>
          <ChevronRight size={22} strokeWidth={1.7}/>
        </Link>
        <Link className="studioBookingOption" href="/oneday">
          <div className="studioOptionIcon"><BookOpenText size={27} strokeWidth={1.7}/></div>
          <div>
            <span>MONTHLY CLASS</span>
            <h2>원데이 클래스</h2>
            <p>함께 읽고 생각하는 시간을 만나보세요.</p>
          </div>
          <ChevronRight size={22} strokeWidth={1.7}/>
        </Link>
      </section>
      <section className="studioSection studioBookingPolicy">
        <h2><Clock3 size={20}/> 예약 안내</h2>
        <div className="studioPolicyLine"><PenLine size={18}/><span>수업은 시작 <strong>3시간 전까지</strong> 예약할 수 있어요.</span></div>
        <div className="studioPolicyLine"><CalendarDays size={18}/><span>수업 시작 <strong>3시간 전까지 취소</strong>하면 수강권이 차감되지 않아요.</span></div>
        <p>4회 정규수강권은 첫 수업일로부터 10주 동안 사용할 수 있어요.</p>
      </section>
      <BottomNav />
    </main>
  );
}
