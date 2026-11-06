"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Row = Record<string,any>;
type Data = {today:string;month:string;metrics:{todayRevenue:number;monthRevenue:number;revenueBySource:{source:string;amount:number}[]};regular:Row[];contents:Row[];lessons:Row[];sales:Row[];notes:Row[];accountingNotice:string};
type Section = "home"|"lessons"|"sales"|"content"|"notes"|"links";
const channels:Record<string,string>={blog:"네이버 블로그",myplace:"네이버 마이플레이스",instagram:"인스타그램",brunch:"브런치스토리"};
const money=(value:number)=>new Intl.NumberFormat("ko-KR").format(value||0)+"원";
const when=(d:string)=>new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(d));
const localDatetime=(d:Date)=>{const p=new Date(d.getTime()-d.getTimezoneOffset()*60000);return p.toISOString().slice(0,16)};
const blank:Record<string,Row>={
 content:{channel:"blog",kind:"일반 게시물",title:"",body:"",keywords:"",status:"아이디어",planned_on:"",published_on:"",published_url:"",memo:""},
 lesson:{title:"",start_at:localDatetime(new Date()),end_at:localDatetime(new Date(Date.now()+3600000)),memo:""},
 sale:{payment_on:new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"}),amount_krw:"",category:"기타 수입",memo:""},
 note:{title:"",body:""}
};
const menu:{key:Section;title:string}[]=[{key:"home",title:"홈"},{key:"lessons",title:"수업 관리"},{key:"sales",title:"매출 기록"},{key:"content",title:"콘텐츠 관리"},{key:"notes",title:"운영 노트"},{key:"links",title:"바로가기"}];
const sources=[["예약 앱 관리자","https://reservation.moonjang.site/admin"],["예약 앱","https://reservation.moonjang.site"],["문장학교 홈페이지","https://moonjangschool.lovable.app"],["네이버 블로그","https://blog.naver.com/classgo1"],["네이버 마이플레이스 관리자","https://new.smartplace.naver.com/"],["인스타그램","https://www.instagram.com/"],["브런치스토리","https://brunch.co.kr/"]];
export default function WorkspacePage(){
 const [password,setPassword]=useState("");const [authorized,setAuthorized]=useState(false);
 const [section,setSection]=useState<Section>("home");const [data,setData]=useState<Data|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const [editor,setEditor]=useState<{type:string;id?:string;values:Row}|null>(null);
 const [filter,setFilter]=useState("all");const [query,setQuery]=useState("");
 async function api(payload:Row){const response=await fetch("/api/admin/workspace",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({password,...payload})});const out=await response.json();if(!response.ok)throw new Error(out.message||"불러오기에 실패했습니다.");return out}
 async function refresh(){setBusy(true);setError("");try{const result=await api({action:"load"});setData(result);setAuthorized(true)}catch(e){setError(e instanceof Error?e.message:"오류");setAuthorized(false)}finally{setBusy(false)}}
 async function save(){if(!editor)return;setBusy(true);setError("");try{const values={...editor.values};if(editor.type==="lesson"){values.start_at=new Date(values.start_at).toISOString();values.end_at=new Date(values.end_at).toISOString()}await api({action:"save",type:editor.type,id:editor.id,data:values});setEditor(null);await refresh()}catch(e){setError(e instanceof Error?e.message:"저장 실패")}finally{setBusy(false)}}
 async function remove(type:string,id:string){if(!window.confirm("이 기록을 삭제할까요? 삭제한 내용은 복구할 수 없습니다."))return;setBusy(true);setError("");try{await api({action:"delete",type,id});await refresh()}catch(e){setError(e instanceof Error?e.message:"삭제 실패")}finally{setBusy(false)}}
 function open(type:string,record?:Row){const values=record?{...record}: {...blank[type]};if(type==="lesson"&&record){values.start_at=localDatetime(new Date(record.start_at));values.end_at=localDatetime(new Date(record.end_at))}setEditor({type,id:record?.id,values});setError("")}
 const entries=useMemo(()=>data?.contents.filter(x=>(filter==="all"||x.channel===filter)&&(!query||[x.title,x.body,x.keywords].join(" ").toLowerCase().includes(query.toLowerCase())))||[],[data,filter,query]);
 const todayLessons=useMemo(()=>data?.lessons.filter(x=>new Date(x.start_at).toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"})===data.today).sort((a,b)=>String(a.start_at).localeCompare(String(b.start_at)))||[],[data]);
 const todayRegular=data?.regular||[];
 const headers:Record<string,string>={content:"콘텐츠",lesson:"직접 등록 수업",sale:"기타 입금",note:"운영 노트"};
 return <div className="workspaceLayout">
  <aside className="workspaceSidebar"><div className="workspaceBrand"><strong>문장학교</strong><small>작업실</small></div>
  <nav aria-label="작업실 메뉴">{menu.map(item=><button className={section===item.key?"selected":""} key={item.key} onClick={()=>{setSection(item.key);setEditor(null)}}>{item.title}</button>)}</nav>
  <div className="workspaceAsideFoot"><Link href="/admin">예약 관리자 →</Link></div></aside>
  <main className="workspaceMain">
  <header className="workspaceHeader"><div><span className="workspaceKicker">MOONJANG SCHOOL</span><h1>{section==="home"?"문장학교 운영 현황":menu.find(x=>x.key===section)?.title}</h1><p>읽고, 이해하고, 나만의 문장을 쓰는 곳</p></div>{authorized&&<button className="workspaceOutline" onClick={refresh} disabled={busy}>새로고침</button>}</header>
  {!authorized?<section className="workspacePanel workspaceLogin"><h2>대표자 로그인</h2><p>예약 앱 관리자 비밀번호로 로그인해 주세요.</p><form onSubmit={e=>{e.preventDefault();refresh()}}><input type="password" autoComplete="current-password" placeholder="관리자 비밀번호" value={password} onChange={e=>setPassword(e.target.value)} required/><button type="submit" disabled={busy}>{busy?"확인 중…":"작업실 열기"}</button></form></section>:null}
  {error&&<p className="workspaceError" role="alert">{error}</p>}
  {authorized&&data&&<div className="workspaceBody">
   {section==="home"&&<>
    <div className="workspaceStats">
     <article className="workspaceMetric"><span>오늘 입금 기준 매출</span><strong>{money(data.metrics.todayRevenue)}</strong><small>{data.today}</small></article>
     <article className="workspaceMetric"><span>{data.month} 입금 기준 매출</span><strong>{money(data.metrics.monthRevenue)}</strong><small>환불·중복입금 검토 필요</small></article>
     <article className="workspaceMetric"><span>오늘 정규 예약</span><strong>{todayRegular.length}건</strong><small>취소 제외</small></article>
     <article className="workspaceMetric"><span>오늘 직접 등록 수업</span><strong>{todayLessons.length}건</strong><small>외부 강의·별도 수업</small></article>
    </div>
    <section className="workspacePanel"><div className="workspacePanelHead"><h2>오늘의 수업</h2><button className="workspaceOutline" onClick={()=>setSection("lessons")}>수업 관리 →</button></div>
      <div className="workspaceSplit"><div><h3>정규 예약 · {todayRegular.length}건</h3>{todayRegular.length?todayRegular.map(x=><div className="workspaceRecord" key={x.id}><strong>{when(x.start_at)}</strong><span>{x.status==="done"?"수업 완료":"예약"}</span></div>):<p className="workspaceMuted">오늘 예약된 정규수업이 없습니다.</p>}</div>
      <div><h3>직접 등록 · {todayLessons.length}건</h3>{todayLessons.length?todayLessons.map(x=><div className="workspaceRecord" key={x.id}><strong>{when(x.start_at)} · {x.title}</strong></div>):<p className="workspaceMuted">직접 등록한 수업이 없습니다.</p>}</div></div>
      <a className="workspaceLinkButton" target="_blank" rel="noopener noreferrer" href="https://reservation.moonjang.site/admin">예약 앱 관리자 바로가기 ↗</a>
    </section>
    <section className="workspacePanel"><div className="workspacePanelHead"><h2>콘텐츠 운영 현황</h2><button className="workspaceOutline" onClick={()=>setSection("content")}>콘텐츠 관리 →</button></div><div className="workspaceChannelGrid">{Object.entries(channels).map(([k,v])=><div key={k} className="workspaceChannel"><span>{v}</span><strong>{data.contents.filter(x=>x.channel===k).length}개</strong><small>발행 완료 {data.contents.filter(x=>x.channel===k&&x.status==="발행 완료").length}개</small></div>)}</div></section>
    <section className="workspacePanel"><h2>매출 집계 내역</h2>{data.metrics.revenueBySource.map(x=><div key={x.source} className="workspaceRecord"><span>{x.source}</span><strong>{money(x.amount)}</strong></div>)}<p className="workspaceMuted">{data.accountingNotice}</p></section>
   </>}
   {section==="lessons"&&<section className="workspacePanel"><div className="workspacePanelHead"><h2>직접 등록 수업</h2><button onClick={()=>open("lesson")}>+ 수업 등록</button></div><p className="workspaceMuted">예약 앱에서 등록된 정규수업은 홈에서 자동 표시됩니다. 외부 출강 등은 여기에 별도로 등록하세요.</p>{data.lessons.length?data.lessons.map(x=><div className="workspaceRecord" key={x.id}><div><strong>{x.title}</strong><small>{when(x.start_at)} – {when(x.end_at)}</small><small>{x.memo}</small></div><div className="workspaceActions"><button className="workspaceOutline" onClick={()=>open("lesson",x)}>수정</button><button className="workspaceOutline" onClick={()=>remove("lesson",x.id)}>삭제</button></div></div>):<p>등록된 수업이 없습니다.</p>}</section>}
   {section==="sales"&&<section className="workspacePanel"><div className="workspacePanelHead"><h2>직접 등록 매출</h2><button onClick={()=>open("sale")}>+ 입금 기록</button></div><p className="workspaceMuted">예약 앱에 이미 수강료로 기록한 금액은 다시 입력하지 마세요. 외부 강의료 등 별도 입금 내역을 등록하는 메뉴입니다.</p>{data.sales.length?data.sales.map(x=><div className="workspaceRecord" key={x.id}><div><strong>{money(x.amount_krw)}</strong><small>{x.payment_on} · {x.category} · {x.memo}</small></div><div className="workspaceActions"><button className="workspaceOutline" onClick={()=>open("sale",x)}>수정</button><button className="workspaceOutline" onClick={()=>remove("sale",x.id)}>삭제</button></div></div>):<p>등록된 별도 입금 기록이 없습니다.</p>}</section>}
   {section==="content"&&<section className="workspacePanel"><div className="workspacePanelHead"><h2>콘텐츠 목록</h2><button onClick={()=>open("content")}>+ 콘텐츠 등록</button></div><div className="workspaceFilters"><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">전체 채널</option>{Object.entries(channels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><input aria-label="콘텐츠 검색" placeholder="제목·본문·키워드 검색" value={query} onChange={e=>setQuery(e.target.value)}/></div>{entries.length?entries.map(x=><div className="workspaceRecord" key={x.id}><div><strong>{x.title}</strong><small>{channels[x.channel]} · {x.kind} · {x.status} {x.planned_on?"· "+x.planned_on:""}</small></div><div className="workspaceActions">{x.published_url&&<a target="_blank" rel="noopener noreferrer" href={x.published_url}>게시물 ↗</a>}<button className="workspaceOutline" onClick={()=>open("content",x)}>수정</button><button className="workspaceOutline" onClick={()=>remove("content",x.id)}>삭제</button></div></div>):<p>조건에 맞는 콘텐츠가 없습니다.</p>}<p className="workspaceMuted">발행 예정은 작업실 내 관리 상태이며, 네이버·인스타그램·브런치에 자동 게시하지 않습니다.</p></section>}
   {section==="notes"&&<section className="workspacePanel"><div className="workspacePanelHead"><h2>운영 기록</h2><button onClick={()=>open("note")}>+ 새 기록</button></div>{data.notes.length?data.notes.map(x=><div className="workspaceRecord" key={x.id}><div><strong>{x.title}</strong><small>{String(x.body||"").slice(0,140)}</small></div><div className="workspaceActions"><button className="workspaceOutline" onClick={()=>open("note",x)}>수정</button><button className="workspaceOutline" onClick={()=>remove("note",x.id)}>삭제</button></div></div>):<p>운영 기록을 처음 작성해 보세요. 오늘의 고민, 새로운 아이디어, 성과 등을 남길 수 있습니다.</p>}</section>}
   {section==="links"&&<section className="workspacePanel"><h2>문장학교 운영 바로가기</h2><div className="workspaceQuickLinks">{sources.map(([label,url])=><a key={label} href={url} target="_blank" rel="noopener noreferrer">{label} ↗</a>)}</div><p className="workspaceMuted">일부 채널은 대표자 계정별 주소가 확인되지 않아 서비스 기본 페이지로 연결됩니다.</p></section>}
  </div>}
  </main>
  {editor&&<div className="workspaceDialogBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditor(null)}}><div className="workspaceDialog" role="dialog" aria-modal="true" aria-label={headers[editor.type]+" 편집"}><div className="workspacePanelHead"><h2>{headers[editor.type]} {editor.id?"수정":"등록"}</h2><button className="workspaceOutline" onClick={()=>setEditor(null)}>닫기</button></div><form onSubmit={e=>{e.preventDefault();save()}}>
  {Object.entries(editor.values).filter(([key])=>!["id","created_at","updated_at"].includes(key)).map(([key,value])=>{
   const captions:Record<string,string>={title:"제목",body:"본문·메모",start_at:"시작 시간",end_at:"종료 시간",memo:"메모",payment_on:"입금 날짜",amount_krw:"입금액(원)",category:"구분",channel:"채널",kind:"게시물 종류",keywords:"핵심 키워드",status:"진행 상태",planned_on:"발행 예정일",published_on:"발행 완료일",published_url:"발행 URL"};
   if(!captions[key])return null;
   const setter=(v:string)=>setEditor(prev=>prev?{...prev,values:{...prev.values,[key]:v}}:null);
   const required=["title","start_at","end_at","amount_krw","payment_on"].includes(key);
   let control;
   if(key==="channel")control=<select value={String(value||"blog")} onChange={e=>setter(e.target.value)}>{Object.entries(channels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select>;
   else if(key==="status")control=<select value={String(value||"아이디어")} onChange={e=>setter(e.target.value)}>{["아이디어","초안","검토","발행 예정","발행 완료"].map(x=><option key={x}>{x}</option>)}</select>;
   else if(key==="body"||key==="memo")control=<textarea rows={key==="body"?7:3} value={String(value??"")} onChange={e=>setter(e.target.value)}/>;
   else control=<input required={required} type={["payment_on","planned_on","published_on"].includes(key)?"date":["start_at","end_at"].includes(key)?"datetime-local":key==="amount_krw"?"number":key==="published_url"?"url":"text"} min={key==="amount_krw"?"0":undefined} value={String(value??"")} onChange={e=>setter(e.target.value)}/>;
   return <label className="workspaceField" key={key}><span>{captions[key]}</span>{control}</label>
  })}{error&&<p className="workspaceError">{error}</p>}<div className="workspaceFormFooter"><button className="workspaceOutline" type="button" onClick={()=>setEditor(null)}>취소</button><button type="submit" disabled={busy}>{busy?"저장 중…":"저장하기"}</button></div></form></div></div>}
 </div>;
}
