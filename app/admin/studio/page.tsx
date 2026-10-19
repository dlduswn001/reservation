"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChartNoAxesCombined, ChevronLeft, ChevronRight, ExternalLink, NotebookPen, Plus, RefreshCw, Save, Trash2 } from "lucide-react";

type Channel = "naver" | "place" | "instagram" | "brunch";
type PostStatus = "idea" | "draft" | "ready" | "published";
type Post = {
  id: string; title: string; channel: Channel; format: "post" | "essay" | "cardnews" | "story" | "notice";
  status: PostStatus; planned_date: string | null; published_url: string; keywords: string;
  body: string; notes: string; created_at: string; updated_at: string;
};
type Draft = Pick<Post, "title" | "channel" | "format" | "status" | "planned_date" | "published_url" | "keywords" | "body" | "notes">;
type Overview = {
  registrations: { amount_krw: number; payment_date: string }[];
  bookings: { id: string; start_at: string; end_at: string; status: string; students?: { name?: string } | null }[];
  classes: { id: string; start_at: string; end_at: string; title: string; is_deleted?: boolean }[];
  blockedTimes: { id: string; start_at: string; end_at: string; title: string }[];
};
const channelName: Record<Channel,string> = { naver:"네이버 블로그", place:"네이버 플레이스", instagram:"인스타그램", brunch:"브런치스토리" };
const channelHref: Record<Channel,string> = {
  naver:"https://blog.naver.com/classgo1", place:"https://new.smartplace.naver.com/",
  instagram:"https://www.instagram.com/", brunch:"https://brunch.co.kr/"
};
const statusName: Record<PostStatus,string> = { idea:"아이디어", draft:"작성 중", ready:"발행 준비", published:"발행 완료" };
const newDraft = (): Draft => ({ title:"", channel:"naver", format:"post", status:"idea", planned_date:null,
  published_url:"", keywords:"", body:"", notes:"" });
function dayKey(v: string) {
  const parts = new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(v));
  const get = (key:string) => parts.find(p=>p.type===key)?.value || "";
  return get("year")+"-"+get("month")+"-"+get("day");
}
function timeLabel(v:string) {
  return new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(v));
}
function money(value:number) { return Math.round(value).toLocaleString("ko-KR")+"원"; }

export default function StudioPage() {
  const [password,setPassword] = useState("");
  const [passwordInput,setPasswordInput] = useState("");
  const [overview,setOverview] = useState<Overview|null>(null);
  const [posts,setPosts] = useState<Post[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [month,setMonth] = useState(()=>dayKey(new Date().toISOString()).slice(0,7));
  const [selectedChannel,setSelectedChannel] = useState<Channel|"all">("all");
  const [editing,setEditing] = useState<Post|null>(null);
  const [draft,setDraft] = useState<Draft>(newDraft);
  const [formVisible,setFormVisible] = useState(false);
  const today = dayKey(new Date().toISOString());
  async function api(path:string, pass:string, payload:Record<string,unknown>) {
    const response = await fetch(path,{ method:"POST", headers:{"Content-Type":"application/json"},
      cache:"no-store",body:JSON.stringify({password:pass,...payload}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "요청에 실패했습니다.");
    return data;
  }
  async function load(pass:string) {
    setLoading(true);
    setMessage("");
    try {
      const [schedule,content] = await Promise.all([
        api("/api/admin/overview",pass,{}),
        api("/api/admin/content",pass,{action:"list"})
      ]);
      setOverview(schedule);
      setPosts(content.posts || []);
      setPassword(pass);
      try { window.sessionStorage.setItem("munjang_admin_session_password",pass); } catch {}
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "불러오기에 실패했습니다.");
    } finally { setLoading(false); }
  }
  useEffect(()=>{
    let pass="";
    try { pass=window.sessionStorage.getItem("munjang_admin_session_password") || ""; } catch {}
    if (pass) { void load(pass); } else { setLoading(false); }
  },[]);
  const todayBookings = useMemo(()=> (overview?.bookings || []).filter(b=>
    dayKey(b.start_at)===today && !["cancelled","late_cancelled"].includes(b.status)
  ).sort((a,b)=>a.start_at.localeCompare(b.start_at)),[overview,today]);
  const todayBlocks = useMemo(()=> (overview?.blockedTimes || []).filter(b=>dayKey(b.start_at)===today),[overview,today]);
  const todayOneDays = useMemo(()=> (overview?.classes || []).filter(b=>dayKey(b.start_at)===today && !b.is_deleted),[overview,today]);
  const registrations = overview?.registrations || [];
  const monthRevenue = registrations.filter(r=>r.payment_date?.slice(0,7)===month)
    .reduce((sum,r)=>sum+Number(r.amount_krw||0),0);
  const todayRevenue = registrations.filter(r=>r.payment_date?.slice(0,10)===today)
    .reduce((sum,r)=>sum+Number(r.amount_krw||0),0);
  const hasMonthRevenueRecords = registrations.some(r=>r.payment_date?.slice(0,7)===month);
  const hasTodayRevenueRecords = registrations.some(r=>r.payment_date?.slice(0,10)===today);
  const filtered = posts.filter(post=>selectedChannel==="all" || post.channel===selectedChannel)
    .sort((a,b)=>(b.planned_date||b.created_at).localeCompare(a.planned_date||a.created_at));
  const published = posts.filter(p=>p.status==="published" && (p.planned_date||p.created_at).slice(0,7)===month).length;
  const ready = posts.filter(p=>p.status==="ready").length;
  function edit(post?: Post) {
    setEditing(post || null);
    setDraft(post ? {title:post.title,channel:post.channel,format:post.format,status:post.status,
      planned_date:post.planned_date,published_url:post.published_url||"",keywords:post.keywords||"",
      body:post.body||"",notes:post.notes||""} : newDraft());
    setFormVisible(true);
    setMessage("");
  }
  async function save() {
    if (!draft.title.trim()) { setMessage("콘텐츠 제목을 입력해 주세요."); return; }
    setBusy(true); setMessage("");
    try {
      const answer = await api("/api/admin/content",password,{
        action:editing?"update":"create",id:editing?.id,updated_at:editing?.updated_at,post:draft
      });
      setPosts(list=>editing?list.map(p=>p.id===editing.id?answer.post:p):[answer.post,...list]);
      setFormVisible(false); setEditing(null);
      setMessage("콘텐츠 기록을 저장했습니다.");
    } catch(e) { setMessage(e instanceof Error?e.message:"저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!editing || !window.confirm("이 콘텐츠 기록을 삭제할까요?")) return;
    setBusy(true); setMessage("");
    try {
      await api("/api/admin/content",password,{action:"delete",id:editing.id,updated_at:editing.updated_at});
      setPosts(list=>list.filter(p=>p.id!==editing.id));setEditing(null);setFormVisible(false);
      setMessage("콘텐츠 기록을 삭제했습니다.");
    } catch(e){setMessage(e instanceof Error?e.message:"삭제하지 못했습니다.");}
    finally{setBusy(false);}
  }
  function shiftMonth(delta:number) {
    const [y,m]=month.split("-").map(Number);
    const date=new Date(Date.UTC(y,m-1+delta,1));
    setMonth(date.toISOString().slice(0,7));
  }
  const [yy,mm]=month.split("-").map(Number);
  return <main className="studio">
    <header className="topbar"><div><strong>문장학교</strong><span>운영 작업실</span></div>
      <div className="headerLinks"><Link href="/admin">예약 관리자 <ExternalLink size={15}/></Link><Link href="/">수강생 화면</Link></div>
    </header>
    {loading && <section className="panel">운영 자료를 불러오는 중입니다.</section>}
    {!loading && !overview && <section className="panel login">
      <span className="eyebrow">문장학교 운영자 전용</span><h1>운영 작업실 로그인</h1>
      <p>예약 앱 관리자 비밀번호로 로그인합니다.</p>
      <form onSubmit={e=>{e.preventDefault();void load(passwordInput);}}>
        <input type="password" aria-label="관리자 비밀번호" value={passwordInput}
          onChange={e=>setPasswordInput(e.target.value)} autoComplete="current-password" />
        <button type="submit">작업실 열기</button>
      </form>
    </section>}
    {overview && <>
      <section className="welcome">
        <div><span className="eyebrow">MOONJANG WORKSPACE</span><h1>오늘도 문장학교를 쌓아갑니다.</h1>
        <p>{today.replace(/-/g,".")} · 수업과 콘텐츠를 한곳에서 기록하세요.</p></div>
        <button className="outline" onClick={()=>void load(password)}><RefreshCw size={16}/> 새로고침</button>
      </section>
      <div className="monthControl">
        <button aria-label="이전 달" onClick={()=>shiftMonth(-1)}><ChevronLeft size={19}/></button>
        <strong>{yy}년 {mm}월</strong>
        <button aria-label="다음 달" onClick={()=>shiftMonth(1)}><ChevronRight size={19}/></button>
      </div>
      <section className="stats">
        <article className="stat"><div><ChartNoAxesCombined size={19}/> 월 매출</div><strong>{hasMonthRevenueRecords?money(monthRevenue):"미기록"}</strong><small>등록·재등록 결제 기록 기준</small></article>
        <article className="stat"><div><ChartNoAxesCombined size={19}/> 오늘 매출</div><strong>{hasTodayRevenueRecords?money(todayRevenue):"미기록"}</strong><small>{today} 등록 결제 기준</small></article>
        <article className="stat"><div><CalendarDays size={19}/> 오늘의 정규수업</div><strong>{todayBookings.length}<em>건</em></strong><small>직접 등록한 예약 포함</small></article>
        <article className="stat"><div><NotebookPen size={19}/> 추가 일정</div><strong>{todayBlocks.length+todayOneDays.length}<em>건</em></strong><small>외부 일정·원데이 클래스</small></article>
      </section>
      <p className="disclaimer">매출은 실제 입력된 신규·재등록 결제 장부를 기준으로 표시합니다. 예약별 입금 확인 금액은 중복 계산 방지를 위해 합산하지 않습니다. 기록되지 않은 현장 매출도 포함되지 않습니다. 결제 기록이 없는 날과 달은 0원이 아닌 미기록으로 표시합니다.</p>
      <div className="two">
        <section className="panel">
          <div className="sectionHead"><div><span className="eyebrow">LESSON SCHEDULE</span><h2>오늘의 수업</h2></div><Link className="textLink" href="/admin">예약 관리 <ChevronRight size={16}/></Link></div>
          {todayBookings.length===0 && todayBlocks.length===0 && todayOneDays.length===0 && <p className="empty">오늘 등록된 일정이 없습니다.</p>}
          {[...todayBookings.map(b=>({id:b.id,time:b.start_at,end:b.end_at,title:b.students?.name||"정규수업",kind:"정규수업"})),
            ...todayBlocks.map(b=>({id:b.id,time:b.start_at,end:b.end_at,title:b.title,kind:"외부 일정"})),
            ...todayOneDays.map(b=>({id:b.id,time:b.start_at,end:b.end_at,title:b.title,kind:"원데이"}))]
            .sort((a,b)=>a.time.localeCompare(b.time)).map(b=><div className="scheduleRow" key={b.kind+b.id}>
              <strong>{timeLabel(b.time)}</strong><span>{b.title}<small>{b.kind} · {timeLabel(b.end)} 종료</small></span></div>)}
        </section>
        <section className="panel">
          <div className="sectionHead"><div><span className="eyebrow">CONTENT PULSE</span><h2>콘텐츠 현황</h2></div><button className="smallBtn" onClick={()=>edit()}><Plus size={16}/> 새 기록</button></div>
          <div className="contentTotals"><div><strong>{posts.length}</strong><span>전체 기록</span></div>
            <div><strong>{ready}</strong><span>발행 준비</span></div>
            <div><strong>{published}</strong><span>선택 월 발행</span></div></div>
          <p className="empty">아이디어부터 게시 완료까지 기록합니다. 외부 채널에 자동 발행하지 않습니다.</p>
        </section>
      </div>
      <section className="panel contentPanel">
        <div className="sectionHead"><div><span className="eyebrow">CONTENT DESK</span><h2>콘텐츠 관리</h2><p>블로그·플레이스·인스타그램·브런치스토리</p></div><button className="primary" onClick={()=>edit()}><Plus size={16}/> 콘텐츠 추가</button></div>
        <div className="channelTabs">{([{value:"all",label:"전체"},...Object.entries(channelName).map(([value,label])=>({value,label}))]).map(item=>
          <button key={item.value} className={selectedChannel===item.value?"active":""}
            onClick={()=>setSelectedChannel(item.value as Channel|"all")}>{item.label}</button>)}</div>
        {filtered.length===0 && <div className="empty">아직 등록된 콘텐츠가 없습니다. 첫 글의 주제부터 기록해 보세요.</div>}
        <div className="postGrid">{filtered.map(p=><button className="post" key={p.id} onClick={()=>edit(p)}>
          <div className="postMeta"><span>{channelName[p.channel]}</span><span className="status">{statusName[p.status]}</span></div>
          <strong>{p.title}</strong><small>{p.planned_date || "발행 날짜 미정"} · {p.format}</small>
          {p.keywords && <p>{p.keywords}</p>}</button>)}</div>
        <div className="channelLinks">{(Object.keys(channelName) as Channel[]).map(c=><a key={c}
          href={channelHref[c]} target="_blank" rel="noopener noreferrer">{channelName[c]} 열기 <ExternalLink size={14}/></a>)}</div>
      </section>
      <footer>읽고, 이해하고, 나만의 문장을 쓰는 곳 · 문장학교</footer>
    </>}
    {message && <div role="status" className="notice">{message}</div>}
    {formVisible && <div className="veil"><section className="editor" aria-label="콘텐츠 작성">
      <div className="sectionHead"><h2>{editing?"콘텐츠 수정":"새 콘텐츠 등록"}</h2><button className="outline" onClick={()=>setFormVisible(false)}>닫기</button></div>
      <label>제목<input maxLength={140} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} /></label>
      <div className="formGrid"><label>채널<select value={draft.channel} onChange={e=>setDraft({...draft,channel:e.target.value as Channel})}>
        {(Object.keys(channelName) as Channel[]).map(k=><option key={k} value={k}>{channelName[k]}</option>)}</select></label>
      <label>진행상태<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as PostStatus})}>
        {(Object.keys(statusName) as PostStatus[]).map(k=><option key={k} value={k}>{statusName[k]}</option>)}</select></label>
      <label>형식<select value={draft.format} onChange={e=>setDraft({...draft,format:e.target.value as Draft["format"]})}>
        <option value="post">포스팅</option><option value="essay">에세이</option><option value="cardnews">카드뉴스</option><option value="story">스토리</option><option value="notice">공지</option></select></label>
      <label>발행 예정일<input type="date" value={draft.planned_date||""}
        onChange={e=>setDraft({...draft,planned_date:e.target.value||null})}/></label></div>
      <label>키워드<input maxLength={1000} value={draft.keywords} onChange={e=>setDraft({...draft,keywords:e.target.value})} placeholder="성인 글쓰기, 1:1 글쓰기 수업" /></label>
      <label>본문/초안<textarea rows={8} maxLength={50000} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/></label>
      <label>운영 메모<textarea rows={3} maxLength={5000} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
      <label>발행한 글 주소<input type="url" maxLength={2000} value={draft.published_url} onChange={e=>setDraft({...draft,published_url:e.target.value})} placeholder="https://..." /></label>
      <div className="actions"><button disabled={busy} className="primary" onClick={()=>void save()}><Save size={16}/> 저장</button>
        {editing && <button disabled={busy} className="delete" onClick={()=>void remove()}><Trash2 size={16}/> 삭제</button>}</div>
      <p className="help">이 화면에서 저장하면 운영 기록으로 남습니다. 외부 채널 게시물에는 직접 반영되지 않습니다.</p>
    </section></div>}
    <style jsx>{`
      .studio{max-width:1060px;margin:auto;padding:20px 18px 90px;color:#332b2d}
      .topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #e9dadd;padding:6px 0 19px;margin-bottom:28px}
      .topbar>div:first-child{display:flex;align-items:baseline;gap:10px}.topbar strong{font-size:24px;letter-spacing:-1px;color:#722638}.topbar span{font-size:12px;color:#85757a}
      .headerLinks{display:flex;gap:8px;flex-wrap:wrap}.headerLinks a,.textLink{display:inline-flex;align-items:center;gap:5px;color:#6e283a;font-size:13px;font-weight:700}
      .welcome{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:20px}.welcome h1{font-size:27px;letter-spacing:-1px;margin:8px 0}.welcome p{margin:0;font-size:14px}
      .eyebrow{font-size:11px;font-weight:900;letter-spacing:1.3px;color:#902f4a}.monthControl{display:flex;align-items:center;justify-content:center;gap:18px;margin:22px 0 16px}.monthControl button{background:#f5edf0;color:#722638;padding:9px;margin:0;border-radius:12px}
      .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.stat,.panel{background:white;border:1px solid #ebdfe2;border-radius:18px;box-shadow:0 6px 24px #541b2b08}.stat{padding:21px 16px}.stat>div{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:#76515d}.stat strong{display:block;margin:17px 0 8px;font-size:26px;white-space:nowrap;letter-spacing:-1px;color:#632337}.stat strong em{font-style:normal;font-size:15px}.stat small{font-size:11px;color:#82777b}
      .disclaimer{font-size:12px;line-height:1.6;margin:12px 2px 22px;color:#82777b}.two{display:grid;grid-template-columns:1.2fr 1fr;gap:14px}.panel{padding:22px;margin:0 0 17px}.sectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.sectionHead h2{font-size:20px;margin:5px 0}.sectionHead p{font-size:13px;margin:0}
      .scheduleRow{display:flex;gap:15px;align-items:center;padding:12px 0;border-bottom:1px solid #f0e8e9}.scheduleRow>strong{color:#73283b;font-size:17px;min-width:55px}.scheduleRow span{font-weight:700;font-size:14px}.scheduleRow small{display:block;margin-top:4px;font-size:12px;font-weight:400;color:#888}
      .contentTotals{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.contentTotals>div{border-radius:13px;background:#f9f3f5;padding:18px 8px;text-align:center}.contentTotals strong{display:block;font-size:26px;color:#78273d}.contentTotals span{font-size:12px;color:#79636b}.empty{font-size:13px;padding:16px 0;color:#8b8080}
      .channelTabs{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:18px}.channelTabs button{background:#f8f4f5;color:#6c5960;font-size:12px;padding:10px;margin:0;border:1px solid #e9dfe1;border-radius:99px}.channelTabs button.active{background:#762c40;color:white}
      .postGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.post{text-align:left;display:block;margin:0;background:#fffcfc;border:1px solid #eee3e5;border-radius:13px;color:#322a2d;padding:16px}.post:hover{background:#f8edef}.postMeta{display:flex;justify-content:space-between;gap:8px;margin-bottom:9px;font-size:12px;color:#8b6070}.post .status{color:#762c40;font-weight:800}.post strong{display:block;font-size:15px;margin:6px 0}.post small{font-size:12px;color:#847a7e}.post p{font-size:12px;margin:9px 0 0}.channelLinks{display:flex;gap:16px;flex-wrap:wrap;margin-top:25px}.channelLinks a{font-size:12px;color:#74344a;display:flex;align-items:center;gap:3px}
      .primary,.smallBtn{background:#76283e;color:white;display:inline-flex;gap:6px;align-items:center;border-radius:11px;font-size:13px;padding:11px 13px;margin:0;white-space:nowrap}.outline{background:#f6edf0;color:#70283b;border-radius:11px;padding:10px 13px;margin:0;font-size:13px;display:flex;align-items:center;gap:5px}.delete{background:#9d403f;font-size:13px;display:flex;align-items:center;gap:5px;margin:0}
      footer{text-align:center;font-size:12px;margin-top:30px;color:#998b90}.login{max-width:440px;margin:70px auto}.login h1{font-size:24px}.login form button{width:100%}
      .notice{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#f3e6ea;border:1px solid #9e7983;border-radius:12px;padding:13px;color:#632337;z-index:100;max-width:90vw}
      .veil{position:fixed;inset:0;background:#1b1519a8;display:flex;justify-content:center;align-items:flex-start;overflow:auto;z-index:50;padding:15px}.editor{background:white;border-radius:19px;padding:25px;width:min(100%,690px);margin:20px auto}.editor label{display:block;font-size:13px;font-weight:700;margin:13px 0 6px}.editor input,.editor select,.editor textarea{margin-top:6px;font-size:14px;padding:11px;border-radius:10px}.formGrid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.actions{display:flex;gap:12px;margin-top:18px}.help{font-size:12px}
      @media(max-width:760px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.two{grid-template-columns:1fr}.stat{padding:17px 13px}.stat strong{font-size:23px}.welcome{align-items:flex-start}.welcome h1{font-size:23px}.postGrid{grid-template-columns:1fr}.topbar{align-items:flex-start}.topbar>div:first-child{display:block}.topbar span{display:block}.headerLinks{justify-content:flex-end}}
      @media(max-width:400px){.stats{gap:7px}.stat strong{font-size:20px}.formGrid{grid-template-columns:1fr}.panel{padding:17px}.welcome h1{font-size:21px}}
    `}</style>
  </main>;
}
