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
  const [loading,setLoading] = useState(false);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const studentId=student?.id||"";

  const refresh=useCallback(async()=>{
    if(!studentId)return;
    const [a,b,c]=await Promise.all([
      fetch("/api/freewriting",{cache:"no-store"}),
      fetch("/api/oneday",{cache:"no-store"}),
      fetch("/api/student/history?studentId="+encodeURIComponent(studentId),{cache:"no-store"})
    ]);
    const [x,y,z]=await Promise.all([a.json(),b.json(),c.json()]);
    if(!a.ok||!b.ok||!c.ok)throw Error(x.message||y.message||z.message||"수업을 불러오지 못했습니다.");
    setFree(x.sessions||[]);
    setOther(y.classes||[]);
    setHistory(z.onedayBookings||[]);
  },[studentId]);

  useEffect(()=>{
    if(!studentId){setFree([]);setOther([]);setHistory([]);return;}
    let active=true;
    setLoading(true);
    void refresh().catch(e=>{if(active)setMessage(String(e?.message||e));})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[studentId,refresh]);

  const studentMinutes=Number(student?.lesson_duration_minutes||0);
  const creditCost=studentMinutes===45?1:0.5;
  const entries=useMemo<ExtraClassSlot[]>(()=>{
    if(!student)return[];
    const clubs=[45,90].includes(studentMinutes)?free.map(c=>{
      const mine=history.find(b=>b.class_id===c.id&&b.status==="등록완료");
      const closed=c.booked_count>=c.capacity||new Date(c.start_at).getTime()<=Date.now()+CUTOFF_MS;
      return {
        id:"club:"+c.id,class_id:c.id,start_at:c.start_at,end_at:c.end_at,
        extra_kind:"freewriting" as const,extra_title:"프리 라이팅 클럽",
        extra_count:c.booked_count,extra_capacity:c.capacity,
        extra_booking_id:mine?.id||null,extra_booking_status:mine?.status||null,
        credit_cost:creditCost,is_closed:closed,is_waitlist:false,
        rule_label:"자유 주제로 쓰고, 순회 1:1 지도를 받는 시간 · 정원 5명"
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
  },[free,other,history,student?.id,studentMinutes,creditCost]);

  async function send(entry:ExtraClassSlot) {
    if(!student||busy)return;
    const hasBooking=Boolean(entry.extra_booking_id);
    const club=entry.extra_kind==="freewriting";
    const action=hasBooking?"cancel":"book";
    if(entry.is_closed && !hasBooking)return;
    const explanation=club
      ? (hasBooking?"클럽 신청을 취소하고 수강권을 환급받을까요?":
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
      await refresh();
      await onChanged();
      setMessage(club
        ?(hasBooking?"클럽 신청이 취소되고 수강권이 환급됐습니다.":"클럽 신청 완료 · 수강권 "+creditCost+"회 차감")
        :"원데이 클래스 신청 내역이 반영됐습니다.");
    }catch(e){setMessage(String(e instanceof Error?e.message:e));}
    finally{setBusy(false);}
  }
  return {entries,loading,busy,message,send,refresh};
}
