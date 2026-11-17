"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Student = {
  id:string;name:string;phone_last4:string;
  lesson_duration_minutes?:number;lesson_credits?:number;
};
type FreeSession = {
  id:string;title:string;start_at:string;end_at:string;
  capacity:number;booked_count:number;
};
type OneClass = {
  id:string;title:string;start_at:string;end_at:string;
  remaining:number;waiting_count?:number;
};
type OneBooking = {id:string;class_id?:string;status:string;people_count?:number};
const ACTIVE = new Set(["booked","등록완료","등록대기","입금대기","입금완료","대기"]);
const CUTOFF_MS = 3 * 60 * 60 * 1000;

export type ExtraClassSlot = {
  id:string;
  class_id:string;
  start_at:string;
  end_at:string;
  extra_kind:"freewriting"|"oneday";
  extra_title:string;
  extra_count:number;
  extra_capacity:number;
  extra_booking_id:string|null;
  extra_booking_status:string|null;
  credit_cost:number;
  is_closed:boolean;
  is_waitlist:boolean;
  rule_label:string;
};

/** Load classes only once per student login, and render them in the SAME calendar timeline. */
export function useStudentExtraClasses(student:Student|null,onChanged:()=>Promise<void>|void) {
  const [free,setFree] = useState<FreeSession[]>([]);
  const [other,setOther] = useState<OneClass[]>([]);
  const [history,setHistory] = useState<OneBooking[]>([]);
  const [myClubBookings,setMyClubBookings] = useState<Array<{id:string;class_id:string;status:string}>>([]);
  const [loading,setLoading] = useState(false);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  // Feedback should not persist or cover the booking controls indefinitely.
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4500);
    return () => window.clearTimeout(timer);
  }, [message]);
  const studentId=student?.id||"";
  const studentName=student?.name||"";
  const studentPhone=student?.phone_last4||"";

  async function readJson(response:Response) {
    const result=await response.json();
    if(!response.ok)throw new Error(result.message||"수업 정보를 불러오지 못했습니다.");
    return result;
  }

  const refresh=useCallback(async()=>{
    if(!studentId)return;
    // A failure in legacy one-day/history queries must NEVER hide an open club
    // or disable its enrollment. Fetch the schedule and private booking state
    // separately, then degrade gracefully for unrelated resources.
    const [publicClub,ownClub,oneDay,legacyHistory]=await Promise.allSettled([
      fetch("/api/freewriting",{cache:"no-store"}).then(readJson),
      fetch("/api/freewriting",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"list",studentId,name:studentName,phone_last4:studentPhone}),cache:"no-store"}).then(readJson),
      fetch("/api/oneday",{cache:"no-store"}).then(readJson),
      fetch("/api/student/history?studentId="+encodeURIComponent(studentId),{cache:"no-store"}).then(readJson),
    ]);
    if(publicClub.status==="fulfilled")setFree(publicClub.value.sessions||[]);
    if(ownClub.status==="fulfilled")setMyClubBookings(ownClub.value.my_bookings||[]);
    if(oneDay.status==="fulfilled")setOther(oneDay.value.classes||[]);
    if(legacyHistory.status==="fulfilled")setHistory(legacyHistory.value.onedayBookings||[]);
    if(publicClub.status==="rejected")throw publicClub.reason;
  },[studentId,studentName,studentPhone]);

  useEffect(()=>{
    if(!studentId){setFree([]);setOther([]);setHistory([]);setMyClubBookings([]);setMessage("");return;}
    let active=true;
    setLoading(true);
    void refresh().catch(e=>{if(active)setMessage(String(e?.message||e));})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[studentId,refresh]);

  const studentMinutes=Number(student?.lesson_duration_minutes||0);
  const creditCost=studentMinutes===120?0:studentMinutes===45?1:0.5;
  const entries=useMemo<ExtraClassSlot[]>(()=>{
    if(!student)return[];
    const clubs=[45,90,120].includes(studentMinutes)?free.map(c=>{
      const mine=myClubBookings.find(b=>b.class_id===c.id&&b.status==="등록완료")
        || history.find(b=>b.class_id===c.id&&b.status==="등록완료");
      const closed=c.booked_count>=c.capacity||new Date(c.start_at).getTime()<=Date.now()+CUTOFF_MS;
      return {
        id:"club:"+c.id,class_id:c.id,start_at:c.start_at,end_at:c.end_at,
        extra_kind:"freewriting" as const,extra_title:"프리 라이팅 클럽",
        extra_count:c.booked_count,extra_capacity:c.capacity,
        extra_booking_id:mine?.id||null,extra_booking_status:mine?.status||null,
        credit_cost:creditCost,is_closed:closed,is_waitlist:false,
        rule_label:creditCost===0
          ? `프리 라이팅 클럽 · 신청 ${c.booked_count}/${c.capacity}명 · 무료 참여`
          : `프리 라이팅 클럽 · 신청 ${c.booked_count}/${c.capacity}명 · 수강권 ${creditCost}회 차감`
      };
    }):[];
    const oneDays=other.map(c=>{
      const mine=history.find(b=>b.class_id===c.id&&ACTIVE.has(b.status));
      return {
        id:"oneday:"+c.id,class_id:c.id,start_at:c.start_at,end_at:c.end_at,
        extra_kind:"oneday" as const,extra_title:c.title,
        extra_count:Math.max(0,6-c.remaining),extra_capacity:6,
        extra_booking_id:mine?.id||null,extra_booking_status:mine?.status||null,
        credit_cost:0,
        is_closed:new Date(c.start_at).getTime()<=Date.now()+CUTOFF_MS,
        is_waitlist:c.remaining<=0,
        rule_label:"원데이 클래스 · 신청 가능한 인원은 수업별로 표시"
      };
    });
    return [...clubs,...oneDays].sort((a,b)=>a.start_at.localeCompare(b.start_at));
  },[free,other,history,myClubBookings,student?.id,studentMinutes,creditCost]);

  async function send(entry:ExtraClassSlot) {
    if(!student||busy)return;
    const hasBooking=Boolean(entry.extra_booking_id);
    const club=entry.extra_kind==="freewriting";
    const action=hasBooking?"cancel":"book";
    if(entry.is_closed && !hasBooking)return;
    const explanation=club
      ? (hasBooking?(creditCost===0?"무료 클럽 신청을 취소할까요?":"클럽 신청을 취소하고 수강권을 환급받을까요?"):
          creditCost===0?"프리 라이팅 클럽에 무료로 신청하시겠습니까? (수강권 차감 없음)":
            "프리 라이팅 클럽에 신청하고 수강권 "+creditCost+"회를 차감할까요?")
      : (hasBooking?"원데이 클래스 신청을 취소하시겠습니까?":"원데이 클래스에 신청하시겠습니까?");
    if(!window.confirm(explanation))return;
    setBusy(true);setMessage("");
    try{
      const endpoint=club?"/api/freewriting":hasBooking?"/api/oneday/cancel":"/api/oneday";
      const payload=club?{
        action,studentId:student.id,name:student.name,phone_last4:student.phone_last4,
        classId:entry.class_id,bookingId:entry.extra_booking_id
      }:hasBooking?{
        bookingId:entry.extra_booking_id,student_name:student.name,phone_last4:student.phone_last4
      }:{
        classId:entry.class_id,student_name:student.name,phone_last4:student.phone_last4,people_count:1
      };
      const resp=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const json=await resp.json();
      if(!resp.ok)throw Error(json.message||"신청 처리에 실패했습니다.");
      // The transaction succeeded: immediately reflect the confirmed booking
      // before any non-critical history/profile refresh can fail or lag.
      if(club && json.ok===true){
        if(hasBooking){
          setMyClubBookings(prev=>prev.filter(b=>b.id!==entry.extra_booking_id));
          setHistory(prev=>prev.map(b=>b.id===entry.extra_booking_id?{...b,status:"취소완료"}:b));
          setFree(prev=>prev.map(c=>c.id===entry.class_id
            ? {...c,booked_count:Math.max(0,c.booked_count-1)}:c));
        }else if(typeof json.booking_id==="string"){
          setMyClubBookings(prev=>prev.some(b=>b.id===json.booking_id)?prev:[
            ...prev,{id:json.booking_id,class_id:entry.class_id,status:"등록완료"}
          ]);
          setFree(prev=>prev.map(c=>c.id===entry.class_id
            ? {...c,booked_count:Math.min(c.capacity,c.booked_count+1)}:c));
        }
      }
      const successText=club
        ?(hasBooking?"클럽 신청이 취소되고 수강권이 환급됐습니다.":creditCost===0?"클럽 신청 완료 · 무료 참여 (수강권 차감 없음)":"클럽 신청 완료 · 수강권 "+creditCost+"회 차감")
        :"원데이 클래스 신청 내역이 반영됐습니다.";
      setMessage(successText);
      // A successful transaction must remain visible even if a subsequent
      // schedule/profile refresh fails on a slow mobile connection.
      try{await refresh();await onChanged();}
      catch{setMessage(successText+" 내역 갱신은 화면의 새로고침을 이용해 주세요.");}
    }catch(e){setMessage(String(e instanceof Error?e.message:e));}
    finally{setBusy(false);}
  }
  const upcomingBooked = entries.filter(entry =>
    Boolean(entry.extra_booking_id) && ACTIVE.has(entry.extra_booking_status||"")
      && new Date(entry.end_at).getTime()>Date.now()
  );
  return {entries,upcomingBooked,loading,busy,message,send,refresh};
}
