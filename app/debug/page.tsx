export default function DebugPage() {
  return (
    <main className="container">
      <section className="card">
        <h1>연결 확인</h1>
        <p>아래 버튼을 누르면 Vercel과 Supabase 연결 상태를 확인합니다.</p>
        <p><a className="button" href="/api/debug" target="_blank">연결 상태 열기</a></p>
        <p className="small">확인이 끝나면 이 페이지는 나중에 삭제해도 됩니다.</p>
      </section>
    </main>
  );
}
