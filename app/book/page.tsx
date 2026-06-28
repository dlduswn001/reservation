import Link from "next/link";
import BottomNav from "../components/BottomNav";

export default function BookPage() {
  return (
    <main className="container appContainer">
      <section className="card">
        <h1>예약하기</h1>
        <p>원하는 예약 메뉴를 선택해 주세요.</p>
        <div className="menu appMenu">
          <Link className="button" href="/regular">정규수업 예약하기</Link>
          <Link className="button secondary" href="/oneday">원데이 클래스 신청하기</Link>
        </div>
      </section>
      <BottomNav />
    </main>
  );
}
