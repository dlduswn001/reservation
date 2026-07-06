import Link from "next/link";
import BottomNav from "../components/BottomNav";

export default function BookPage() {
  return (
    <main className="container appContainer">
      <header className="appHeader">
        <strong>예약하기</strong>
        <span aria-hidden="true">♡</span>
      </header>

      <section className="bookingHero card">
        <p className="pageKicker">문장학교 예약 앱</p>
        <h1>원하는 수업을 선택해 예약해 보세요.</h1>
        <p>정규수업 예약과 원데이 클래스 신청을 한곳에서 진행할 수 있어요.</p>
      </section>

      <section className="bookingChoiceGrid">
        <Link className="bookingChoiceCard primary" href="/regular">
          <span className="choiceIcon">✒</span>
          <div>
            <strong>정규수업 예약하기</strong>
            <p>주 1회 정기 수업 일정을 예약할 수 있어요.</p>
          </div>
          <em>›</em>
        </Link>

        <Link className="bookingChoiceCard soft" href="/oneday">
          <span className="choiceIcon">☕</span>
          <div>
            <strong>원데이 클래스 신청하기</strong>
            <p>원하는 날짜의 원데이 클래스를 신청할 수 있어요.</p>
          </div>
          <em>›</em>
        </Link>
      </section>

      <section className="card compactCalendarCard">
        <div className="sectionTitleRow">
          <h2>예약 안내</h2>
        </div>
        <p>수업 예약은 시작 3시간 전까지 가능합니다.</p>
        <p>수업 취소는 3시간 전까지 가능하며, 3시간 이내 취소 시 수강권이 차감됩니다.</p>
      </section>

      <BottomNav />
    </main>
  );
}
