"use client";
import { useEffect,useState } from "react";
import BottomNav from "../components/BottomNav";
type Notice={id:string;title:string;body:string;is_pinned:boolean;created_at:string};
export default function NoticesPage(){
 const [items,setItems]=useState<Notice[]>([]);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [expanded,setExpanded]=useState<string|null>(null);
 useEffect(()=>{let active=true;fetch("/api/announcements",{cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.message||"불러올 수 없습니다.");if(active)setItems(j.notices||[]);}).catch(e=>{if(active)setError(String(e.message||e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 return <main className="container appContainer studioApp" style={{paddingBottom:110}}>
  <header className="studioPageHeader"><h1>문장학교 공지사항</h1></header>
  <p className="studioPageDescription">수업 운영과 행사 소식을 알려드려요.</p>
  {loading&&<section className="card">공지사항을 불러오는 중입니다.</section>}
  {error&&<p role="alert" className="error">{error}</p>}
  {!loading&&!error&&items.length===0&&<section className="card">등록된 공지사항이 없습니다.</section>}
  {items.map(item=><section key={item.id} className="card" style={{marginBottom:12,padding:18}}>
   <button type="button" aria-expanded={expanded===item.id} onClick={()=>setExpanded(expanded===item.id?null:item.id)}
     style={{background:"transparent",width:"100%",padding:0,margin:0,textAlign:"left",border:0,color:"#452d35"}}>
     <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}>
       <div>{item.is_pinned&&<span style={{color:"#882c43",fontSize:12,fontWeight:800}}>상단 고정 · </span>}
       <strong style={{fontSize:16}}>{item.title}</strong></div>
       <span style={{fontSize:12,color:"#87767a",whiteSpace:"nowrap"}}>{new Date(item.created_at).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"})}</span>
     </div>
   </button>
   {expanded===item.id&&<p style={{whiteSpace:"pre-wrap",lineHeight:1.8,fontSize:14,paddingTop:12,marginBottom:0,borderTop:"1px solid #eee",marginTop:14}}>{item.body}</p>}
  </section>)}
  <BottomNav/>
 </main>;
}
