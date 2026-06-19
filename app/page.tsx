import Link from "next/link";
import PWAInstallPrompt from "./components/PWAInstallPrompt";

export default function Home() {
  return (
    <main className="container">
      <section className="card">
        <h1>문장학교 수업 예약</h1>
        <p>
          정규수업과 원데이 클래스를 예약할 수 있는 페이지입니다. 정규수업은 이름과 핸드폰번호 뒷자리 4자리로 입장합니다.
        </p>
        <div className="menu">
          <Link className="button" href="/regular">정규수업 예약하기</Link>
          <Link className="button secondary" href="/oneday">원데이 클래스 예약하기</Link>
          <Link className="button secondary" href="/history">내 수강 기록 확인하기</Link>
          <Link className="button secondary" href="/admin">관리자 페이지</Link>
        </div>
        <PWAInstallPrompt />
      </section>
    </main>
  );
}
