"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, RefreshCw } from "lucide-react";
import BottomNav from "../components/BottomNav";

type Student = { id: string; name: string; phone_last4: string; lesson_credits: number; lesson_duration_minutes: number };
type Slot = { id: string; start_at: string; end_at: string; lesson_minutes: number; is_closed?: boolean; is_waitlist?: boolean; rule_label?: string };
type Booked = { id: string; start_at: string; end_at: string; status: string };
type MonthInfo = { key: string; year: number; month: number; count: number };
const LOGIN_KEY = "munjangStudentLogin";
function kstDay(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(value));
  const find = (key:string) => parts.find(p=>p.type===key)?.value || "";
  return find("year") + "-" + find("month") + "-" + find("day");
}
function displayDay(value: string) {
  return new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"long",day:"numeric",weekday:"long"}).format(new Date(value));
}
function displayTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value));
}
function readSavedLogin() {
  try {
    const obj=JSON.parse(window.localStorage.getItem(LOGIN_KEY)||"null");
    if (obj && typeof obj.name === "string" && /^[0-9]{4}$/.test(String(obj.phone_last4||""))) {
      return {name:obj.name,phone_last4:String(obj.phone_last4)};
    }
  } catch {}
  return null;
}
export default function ExtendedLessonPage() {
  const [name,setName]=useState("");
  const [last4,setLast4]=useState("");
  const [student,setStudent]=useState<Student|null>(null);
  const [slots,setSlots]=useState<Slot[]>([]);
  const [bookings,setBookings]=useState<Booked[]>([]);
  const [months,setMonths]=useState<MonthInfo[]>([]);
  const [selectedMonth,setSelectedMonth]=useState("");
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [permissionDenied,setPermissionDenied]=useState(false);

  async function login(loginName=name,phone=last4) {
    setMessage("");setLoading(true);
    try {
      const response=await fetch("/api/student/login",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name:loginName,phone_last4:phone}),cache:"no-store"});
      const json=await response.json();
      if(!response.ok)throw new Error(json.message||"로그인할 수 없습니다.");
      if(Number(json.student.lesson_duration_minutes)!==120) {
        throw new Error("이 화면은 120분 정규수업 수강생 전용입니다.");
      }
      setStudent(json.student);
      setName(json.student.name);setLast4(json.student.phone_last4);
      // Use the same saved student login as the existing reservation app.
      try{window.localStorage.setItem(LOGIN_KEY,JSON.stringify({id:json.student.id,name:json.student.name,
        phone_last4:json.student.phone_last4}));}catch{}
    }catch(error){setMessage(error instanceof Error?error.message:"로그인할 수 없습니다.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{
    const saved=readSavedLogin();
    if(saved){setName(saved.name);setLast4(saved.phone_last4);void login(saved.name,saved.phone_last4);}
  },[]);

  async function load(studentId:string) {
    setLoading(true);setMessage("");
    try {
      const params=new URLSearchParams({studentId,lessonMinutes:"120",_:String(Date.now())});
      const [slotsResponse,bookingsResponse]=await Promise.all([
        fetch("/api/slots?"+params.toString(),{cache:"no-store"}),
        fetch("/api/student/bookings?studentId="+encodeURIComponent(studentId),{cache:"no-store"})
      ]);
      const slotData=await slotsResponse.json();
      const bookedData=await bookingsResponse.json();
      if(!slotsResponse.ok)throw new Error(slotData.message||"예약 가능한 일정을 불러오지 못했습니다.");
      if(!bookingsResponse.ok)throw new Error(bookedData.message||"내 예약을 불러오지 못했습니다.");
      if(slotData.requires_direct_scheduling===true) {
        setPermissionDenied(true);setSlots([]);setMonths([]);
        setMessage("현재 120분 자동 예약이 허용되지 않은 계정입니다. 문장학교에 문의해 주세요.");
        return;
      }
      setPermissionDenied(false);
      const entries=[...(slotData.slots||[]),...(slotData.closed_slots||[])].filter(
        (entry:Slot)=>Number(entry.lesson_minutes)===120
      ) as Slot[];
      const unique=new Map(entries.map(x=>[new Date(x.start_at).getTime(),x]));
      const ordered=Array.from(unique.values()).sort((a,b)=>a.start_at.localeCompare(b.start_at));
      setSlots(ordered);
      setBookings(bookedData.bookings||[]);
      const availableMonthValues=Array.from(new Set(ordered.map(s=>kstDay(s.start_at).slice(0,7)))).sort();
      const nextMonths=availableMonthValues.map(key=>({
        key,year:Number(key.slice(0,4)),month:Number(key.slice(5,7)),
        count:ordered.filter(s=>kstDay(s.start_at).startsWith(key)&&!s.is_closed).length
      }));
      setMonths(nextMonths);
      setSelectedMonth(previous=>nextMonths.some(m=>m.key===previous)?previous:(nextMonths[0]?.key||""));
    }catch(error){setMessage(error instanceof Error?error.message:"일정을 불러오지 못했습니다.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{if(student?.id)void load(student.id);},[student?.id]);

  async function book(slot:Slot) {
    if(!student || saving || slot.is_closed)return;
    if(!window.confirm(displayDay(slot.start_at)+" "+displayTime(slot.start_at)+"~"+displayTime(slot.end_at)+" 120분 수업을 예약할까요?\n수강권 1회가 차감됩니다."))return;
    setSaving(true);setMessage("");
    try{
      const response=await fetch("/api/book",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({studentId:student.id,slotId:slot.id})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.message||"예약하지 못했습니다.");
      setStudent(prev=>prev?{...prev,lesson_credits:Number(data.lesson_credits)}:prev);
      await load(student.id);
      setMessage("예약이 완료되었습니다. 선택한 120분 수업은 다른 예약창에서도 마감됩니다.");
    }catch(error){setMessage(error instanceof Error?error.message:"예약하지 못했습니다.");if(student)await load(student.id);}
    finally{setSaving(false);}
  }
  const visible=useMemo(()=>slots.filter(s=>kstDay(s.start_at).startsWith(selectedMonth)),[slots,selectedMonth]);
  const grouped=useMemo(()=>{
    const map=new Map<string,Slot[]>();
    visible.forEach(slot=>{
      const key=kstDay(slot.start_at);
      map.set(key,[...(map.get(key)||[]),slot]);
    });
    return Array.from(map.entries()).sort(([a],[b])=>a.localeCompare(b));
  },[visible]);
  const activeIndex=months.findIndex(m=>m.key===selectedMonth);
  const futureBookings=bookings.filter(b=>["booked","change_request","cancel_request"].includes(b.status)
    && new Date(b.end_at).getTime()>Date.now()).sort((a,b)=>a.start_at.localeCompare(b.start_at));

  return <main className="extendedPage">
    <header className="header">
      <div><span className="eyebrow">MOONJANG · WRITING CLASS</span><h1>120분 정규수업 예약</h1>
        <p>읽고, 이해하고, 나만의 문장을 쓰는 곳</p></div>
      <Link href="/regular" className="back">정규수업 홈</Link>
    </header>

    {!student ? <section className="panel login">
      <h2>수강생 로그인</h2><p>문장학교에 등록된 이름과 휴대폰 번호 끝 4자리를 입력해 주세요.</p>
      <form onSubmit={e=>{e.preventDefault();void login();}}>
        <label>이름<input required autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>휴대폰 번호 끝 4자리<input required inputMode="numeric" maxLength={4} pattern="[0-9]{4}"
          value={last4} onChange={e=>setLast4(e.target.value.replace(/[^0-9]/g,"").slice(0,4))}/></label>
        <button className="primary" type="submit" disabled={loading}>{loading?"확인 중":"예약창 열기"}</button>
      </form>
    </section>:<>
      <section className="panel welcome">
        <div><h2>{student.name}님, 반갑습니다.</h2><p>120분 1:1 글쓰기 수업을 예약할 수 있습니다.</p></div>
        <div className="credits"><span>남은 수강권</span><strong>{student.lesson_credits}회</strong></div>
      </section>
      <section className="panel schedule">
        <div className="panelTitle">
          <div><span className="eyebrow">RESERVATION</span><h2>예약 가능한 시간</h2></div>
          <button className="refresh" disabled={loading||saving} onClick={()=>void load(student.id)}>
            <RefreshCw size={15}/> 새로고침
          </button>
        </div>
        <p className="hint">수·목·금 오후 2시 / 5시 / 7시, 토·일 오전 10시 / 오후 1시 / 2시 40분</p>
        <p className="hint">월·화요일은 휴무이며, 이미 예약된 시간과 겹치는 시간은 자동 마감됩니다. 예약·취소는 수업 3시간 전까지 가능합니다.</p>
        {permissionDenied ? <p className="empty">120분 수업은 현재 개별 일정 조율이 필요합니다.</p> : <>
          {months.length>0&&<div className="monthNav">
            <button disabled={activeIndex<=0} aria-label="이전 달" onClick={()=>setSelectedMonth(months[activeIndex-1].key)}><ChevronLeft/></button>
            <strong>{selectedMonth.slice(0,4)}년 {Number(selectedMonth.slice(5,7))}월</strong>
            <button disabled={activeIndex<0||activeIndex>=months.length-1} aria-label="다음 달" onClick={()=>setSelectedMonth(months[activeIndex+1].key)}><ChevronRight/></button>
          </div>}
          {loading&&<p className="empty">예약 가능한 날짜를 확인하고 있습니다.</p>}
          {!loading&&grouped.length===0&&<p className="empty">현재 열려 있는 예약 시간이 없습니다. 새로운 수업 일정이 오픈되면 이곳에 표시됩니다.</p>}
          {grouped.map(([day,entries])=><section className="day" key={day}>
            <h3><CalendarDays size={17}/>{displayDay(entries[0].start_at)}</h3>
            <div className="slotGrid">
              {entries.map(slot=><div className={"slot "+(slot.is_closed?"closed":"")} key={slot.id}>
                <span><Clock3 size={14}/> {displayTime(slot.start_at)} ~ {displayTime(slot.end_at)}</span>
                <strong>120분 수업</strong>
                {slot.is_closed?<span className="closedButton">마감</span>:
                  <button className="primary" disabled={saving||loading||student.lesson_credits<=0}
                    onClick={()=>void book(slot)}>예약하기</button>}
              </div>)}
            </div>
          </section>)}
        </>}
      </section>
      <section className="panel">
        <div className="panelTitle"><h2>내 예약 일정</h2><span className="count">{futureBookings.length}건</span></div>
        {futureBookings.length===0?<p className="empty">예정된 수업이 없습니다.</p>:futureBookings.map(b=>
          <div className="booking" key={b.id}><CheckCircle2 size={17}/>
            <span>{displayDay(b.start_at)} · {displayTime(b.start_at)}~{displayTime(b.end_at)}</span></div>)}
        <p className="hint">예약 변경·취소는 <Link href="/regular">정규수업 예약</Link> 화면의 내 수업 일정에서 할 수 있습니다.</p>
      </section>
      <button className="logout" onClick={()=>{
        try{window.localStorage.removeItem(LOGIN_KEY);}catch{}
        setStudent(null);setSlots([]);setBookings([]);setMessage("");
      }}>다른 수강생으로 로그인</button>
    </>}
    {message&&<div className="feedback" role="status">{message}</div>}
    <BottomNav/>
    <style jsx>{`
      .extendedPage{max-width:960px;margin:auto;padding:26px 16px 115px;color:#352c30}
      .header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px}
      .header h1{font-size:26px;letter-spacing:-1px;color:#6c253a;margin:5px 0}
      .header p{font-size:12px;color:#807179;margin:0}
      .eyebrow{font-size:11px;font-weight:800;letter-spacing:1px;color:#9b4560}
      .back{font-size:13px;font-weight:700;white-space:nowrap;color:#76263d}
      .panel{border:1px solid #eadfe2;background:#fff;border-radius:19px;padding:21px;margin-bottom:15px;box-shadow:0 4px 16px #70263a09}
      .panel h2{font-size:19px;color:#6a283c;margin:0 0 8px}
      .panel p{font-size:14px}
      .welcome{display:flex;justify-content:space-between;align-items:center;gap:10px}
      .welcome p{margin:0;font-size:13px;color:#756d71}
      .credits{min-width:100px;padding:12px;border-radius:14px;background:#f9f1f3;text-align:center}
      .credits span{display:block;font-size:12px;color:#75636d}.credits strong{font-size:23px;color:#76263d}
      .panelTitle{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
      .refresh,.monthNav button{display:inline-flex;align-items:center;gap:5px;background:#faf3f5;color:#74283d;padding:10px;border-radius:10px;font-size:12px;border:0}
      .hint{color:#81757a;font-size:12px!important;line-height:1.65;margin:6px 0}
      .monthNav{display:flex;justify-content:center;align-items:center;gap:20px;margin:19px 0 14px}
      .monthNav button:disabled{opacity:.3}.monthNav strong{font-size:17px}
      .day{padding:14px 0;border-top:1px solid #eee5e7}.day h3{display:flex;align-items:center;gap:8px;font-size:15px;margin:3px 0 11px;color:#5b3140}
      .slotGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
      .slot{border:1px solid #e9dbe0;border-radius:13px;padding:14px 12px;background:#fefcfd;display:flex;flex-direction:column;gap:9px}
      .slot>span:first-child{display:flex;align-items:center;gap:5px;font-size:12px;color:#7a5e6a}
      .slot strong{font-size:14px}.slot.closed{background:#f6f4f4;opacity:.7}
      .primary{width:100%;margin:0;border:0;border-radius:10px;background:#78273e;color:#fff;padding:11px;font-weight:800;font-size:13px;cursor:pointer}
      button:disabled{cursor:not-allowed;opacity:.55}.closedButton{text-align:center;background:#e8e2e4;color:#827b7e;border-radius:9px;padding:10px;font-size:13px}
      .empty{text-align:center;padding:17px 0;color:#786e73}.count{font-size:13px;color:#8d6773}
      .booking{display:flex;gap:10px;align-items:center;border-top:1px solid #f0e8ea;padding:13px 0;font-size:13px;color:#64293b}
      .logout{background:transparent;color:#8e6473;padding:10px;font-size:13px}
      .feedback{position:sticky;bottom:85px;padding:13px 15px;background:#f2e5ea;border:1px solid #d6b4c1;border-radius:12px;color:#64283d;font-size:13px;z-index:9}
      .login{max-width:470px;margin:25px auto}.login form{display:flex;flex-direction:column;gap:12px}.login label{font-size:13px;font-weight:700}
      .login input{display:block;border:1px solid #d9cbd0;border-radius:9px;padding:12px;margin-top:5px;width:100%;font-size:15px}
      @media(max-width:680px){.slotGrid{grid-template-columns:1fr}.slot{display:grid;grid-template-columns:1fr auto;align-items:center;column-gap:9px}.slot strong{grid-column:1}.slot .primary,.slot .closedButton{grid-column:2;grid-row:1 / span 2;min-width:95px}.header h1{font-size:22px}.panel{padding:16px}.credits{min-width:88px}}
    `}</style>
  </main>;
}
