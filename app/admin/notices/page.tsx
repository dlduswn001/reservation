"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
type Notice={id:string;title:string;body:string;is_published:boolean;is_pinned:boolean;created_at:string;updated_at:string};
const blank=()=>({title:"",body:"",is_published:true,is_pinned:false});
export default function AdminNotices(){
 const [pass,setPass]=useState("");
 const [entered,setEntered]=useState("");
 const [items,setItems]=useState<Notice[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [draft,setDraft]=useState(blank);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const api=async(password:string,action:string,more:Record<string,unknown>={})=>{
  const r=await fetch("/api/admin/announcements",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({password,action,...more})});
  const j=await r.json();if(!r.ok)throw Error(j.message||"요청을 처리하지 못했습니다.");return j;
 };
 async function load(password:string){
  setBusy(true);setError("");
  try{const data=await api(password,"list");setItems(data.notices||[]);setPass(password);setLoaded(true);
  try{sessionStorage.setItem("munjang_admin_session_password",password);}catch{}}
  catch(e){setError(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
 }
 useEffect(()=>{let p="";try{p=sessionStorage.getItem("munjang_admin_session_password")||"";}catch{}if(p)void load(p);},[]);
 async function save(){
  if(!draft.title.trim()||!draft.body.trim()){setError("제목과 본문을 입력해 주세요.");return;}
  setBusy(true);setError("");
  try{await api(pass,selected?"update":"create",{id:selected,notice:draft});await load(pass);setDraft(blank());setSelected(null);}
  catch(e){setError(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
 }
 async function remove(){
  if(!selected||!window.confirm("이 공지를 삭제할까요?"))return;setBusy(true);setError("");
  try{await api(pass,"delete",{id:selected});await load(pass);setDraft(blank());setSelected(null);}catch(e){setError(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
 }
 function edit(item:Notice){setSelected(item.id);setDraft({title:item.title,body:item.body,is_published:item.is_published,is_pinned:item.is_pinned});}
 return <main className="container appContainer studioApp" style={{maxWidth:950,paddingBottom:80}}>
  <header className="studioPageHeader"><h1>공지사항 관리</h1></header>
  <p><Link href="/admin">관리자 홈으로 돌아가기</Link> · <Link href="/notices">수강생 공지 보기</Link></p>
  {!loaded?<section className="card" style={{maxWidth:440,padding:18}}>
   <h2>관리자 로그인</h2>
   <form onSubmit={e=>{e.preventDefault();void load(entered);}}>
    <label>관리자 비밀번호<input type="password" autoComplete="current-password" value={entered} onChange={e=>setEntered(e.target.value)} required/></label>
    <button type="submit" disabled={busy}>공지사항 열기</button>
   </form>
  </section>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16}}>
   <section className="card" style={{padding:17}}>
    <h2>등록된 공지 ({items.length})</h2>
    <button type="button" onClick={()=>{setSelected(null);setDraft(blank());}}>새 공지 작성</button>
    {items.map(x=><button key={x.id} type="button" onClick={()=>edit(x)}
      style={{display:"block",width:"100%",textAlign:"left",background:selected===x.id?"#f8edef":"#fff",color:"#422c34",border:"1px solid #e9dde1",padding:12,marginTop:9,borderRadius:9}}>
      <strong>{x.is_pinned?"[고정] ":""}{x.title}</strong>
      <small style={{display:"block",marginTop:5}}>{x.is_published?"공개":"비공개"} · {new Date(x.created_at).toLocaleDateString("ko-KR")}</small>
    </button>)}
   </section>
   <section className="card" style={{padding:17}}>
    <h2>{selected?"공지 수정":"새 공지 작성"}</h2>
    <label>제목<input maxLength={160} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
    <label>본문<textarea rows={12} maxLength={12000} style={{width:"100%",marginTop:8}} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/></label>
    <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={draft.is_published} onChange={e=>setDraft({...draft,is_published:e.target.checked})}/> 수강생에게 공개</label>
    <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={draft.is_pinned} onChange={e=>setDraft({...draft,is_pinned:e.target.checked})}/> 상단 고정</label>
    <button type="button" disabled={busy} onClick={()=>void save()}>저장하기</button>
    {selected&&<button type="button" disabled={busy} onClick={()=>void remove()} style={{marginLeft:8}}>삭제</button>}
   </section>
  </div>}
  {error&&<p role="alert" className="error">{error}</p>}
 </main>;
}
