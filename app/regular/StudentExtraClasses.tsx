"use client";
import { useCallback, useEffect, useState } from "react";
type Student={id:string;name:string;phone_last4:string;lesson_duration_minutes?:number;lesson_credits?:number};
type FreeSession={id:string;title:string;description?:string|null;start_at:string;end_at:string;capacity:number;booked_count:number;my_booking:string|null};
type OneClass={id:string;title:string;description?:string|null;start_at:string;end_at:string;remaining:number;waiting_count?:number};
type OneBooking={id:string;class_id?:string;status:string;people_count?:number;oneday_classes?:{id:string;title:string;start_at:string;end_at:string}|null};
const time=(iso:string)=>new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"long",day:"numeric",weekday:"short",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(iso));
const ACTIVE=new Set(["booked","등록완료","등록대기","입금대기","입금완료","대기"]);
export default function StudentExtraClasses({student,onChanged}:{student:Student;onChanged:()=>Promise<void>|void}){
 const [free,setFree]=useState<FreeSession[]>([]);
 const [other,setOther]=useState<OneClass[]>([]);
 const [history,setHistory]=useState<OneBooking[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const refresh=useCallback(async()=>{
  const [a,b,c]=await Promise.all([
   fetch("/api/freewriting?studentId="+encodeURIComponent(student.id),{cache:"no-store"}),
   fetch("/api/oneday",{cache:"no-store"}),
   fetch("/api/student/history?studentId="+encodeURIComponent(student.id),{cache:"no-store"})
  ]);
  const [x,y,z]=await Promise.all([a.json(),b.json(),c.json()]);
  if(!a.ok||!b.ok||!c.ok)throw Error(x.message||y.message||z.message||"신청 내역을 불러오지 못했습니다.");
  setFree(x.sessions||[]);setOther(y.classes||[]);setHistory(z.onedayBookings||[]);
 },[student.id]);
 useEffect(()=>{let active=true;setLoading(true);refresh().catch(e=>{if(active)setError(String(e.message||e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[refresh]);
 const isClubStudent=[45,90].includes(Number(student.lesson_duration_minutes));
 const cost=Number(student.lesson_duration_minutes)===45?1:0.5;
 async function send(action:"book"|"cancel"|"oneday"|"oneday-cancel",id:string){
  if(busy)return;
  const message=action==="book"?"프리 라이팅 클럽 수강권 "+cost+"회를 차감하고 신청하시겠습니까?"
    :action==="cancel"?"클럽 신청을 취소하고 수강권을 환급받을까요?"
    :action==="oneday"?"원데이 클래스에 신청하시겠습니까?":"원데이 클래스 신청을 취소하시겠습니까?";
  if(!window.confirm(message))return;
  setBusy(true);setError("");
  try{
   const endpoint=action==="book"||action==="cancel"?"/api/freewriting":action==="oneday"?"/api/oneday":"/api/oneday/cancel";
   const payload=action==="book"?{action:"book",classId:id,studentId:student.id,name:student.name,phone_last4:student.phone_last4}:
     action==="cancel"?{action:"cancel",bookingId:id,studentId:student.id,name:student.name,phone_last4:student.phone_last4}:
     action==="oneday"?{classId:id,student_name:student.name,phone_last4:student.phone_last4,people_count:1}:
     {bookingId:id,student_name:student.name,phone_last4:student.phone_last4};
   const resp=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const data=await resp.json();
   if(!resp.ok)throw Error(data.message||"신청을 처리하지 못했습니다.");
   await refresh();
   await onChanged();
   setError(action==="book"?"프리 라이팅 클럽 신청 완료 · 수강권 "+cost+"회 차감":
     action==="cancel"?"클럽 신청이 취소되고 수강권이 환급됐습니다.":"신청 내역이 반영됐습니다.");
  }catch(e){setError(String(e instanceof Error?e.message:e));}
  finally{setBusy(false);}
 }
 const card:React.CSSProperties={border:"1px solid #eadde1",borderRadius:13,padding:15,marginTop:10,background:"#fffdfd"};
 const button:React.CSSProperties={background:"#79283E",color:"#fff",border:0,borderRadius:9,padding:"10px 14px",fontSize:13,marginTop:10};
 return <>
  {isClubStudent&&<section className="card" style={{marginTop:14}}>
   <h2>프리 라이팅 클럽</h2>
   <p className="small">12월 매주 토요일 12:00~14:00 · 정원 5명 · 12시~2시 사이 자유롭게 입실, 오후 2시 종료</p>
   <p className="small">제시된 글쓰기 주제나 나만의 자유 주제로 몰입해서 글을 씁니다. 선생님이 순회하며 1:1로 글쓰기를 지도합니다. 발표는 필수가 아닙니다.</p>
   <p className="small">참가할 때마다 {cost}회 차감 · 시작 3시간 전까지 신청·취소</p>
   {loading&&<p>일정을 불러오는 중입니다.</p>}
   {!loading&&free.length===0&&<p className="small">현재 신청 가능한 클럽이 없습니다.</p>}
   {free.map(c=><div key={c.id} style={card}>
    <strong>{time(c.start_at)}~14:00</strong>
    <p className="small" style={{margin:"7px 0"}}>신청 {c.booked_count}/{c.capacity}명</p>
    {c.my_booking?<button type="button" style={button} disabled={busy||new Date(c.start_at).getTime()<=Date.now()+10800000} onClick={()=>void send("cancel",c.my_booking!)}>신청 취소 · 수강권 환급</button>
    :<button type="button" style={button} disabled={busy||c.booked_count>=c.capacity||Number(student.lesson_credits)<cost||new Date(c.start_at).getTime()<=Date.now()+10800000} onClick={()=>void send("book",c.id)}>{c.booked_count>=c.capacity?"정원 마감":"클럽 신청하기"}</button>}
   </div>)}
  </section>}
  <section className="card" style={{marginTop:14}}>
   <h2>원데이 클래스</h2>
   <p className="small">정규수업 예약 화면에서 신청합니다. 이전에 참여한 원데이 클래스는 이용내역에 그대로 보존됩니다.</p>
   {loading&&<p className="small">일정을 불러오는 중입니다.</p>}
   {!loading&&other.length===0&&<p className="small">현재 모집 중인 원데이 클래스가 없습니다.</p>}
   {other.map(c=>{
    const mine=history.find(b=>b.class_id===c.id&&ACTIVE.has(b.status));
    const closed=new Date(c.start_at).getTime()<=Date.now()+10800000;
    return <div key={c.id} style={card}>
     <strong>{c.title}</strong><p className="small">{time(c.start_at)} 시작</p>
     {c.description&&<p className="small" style={{whiteSpace:"pre-line"}}>{c.description}</p>}
     <p className="small">{c.remaining>0?"잔여 "+c.remaining+"명":"정원 마감 · 대기 가능"}</p>
     {mine?<><p className="small">신청 상태: {mine.status}</p><button type="button" style={button} disabled={busy||closed||mine.status==="대기"} onClick={()=>void send("oneday-cancel",mine.id)}>신청 취소</button></>:
     <button type="button" style={button} disabled={busy||closed} onClick={()=>void send("oneday",c.id)}>{c.remaining>0?"원데이 클래스 신청":"대기 신청하기"}</button>}
    </div>;
   })}
  </section>
  {error&&<p role="status" style={{fontSize:13,color:"#783349"}}>{error}</p>}
 </>;
}
