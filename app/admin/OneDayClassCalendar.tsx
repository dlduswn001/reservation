"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type ClassItem = {id:string;title:string;start_at:string;end_at:string;is_open:boolean};
type Props<T extends ClassItem> = {classes:T[];renderClass:(item:T)=>React.ReactNode};
function dateKey(value:string){
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",
  }).formatToParts(new Date(value));
  const get=(key:string)=>parts.find(part=>part.type===key)?.value||"";
  return get("year")+"-"+get("month")+"-"+get("day");
}
function monthOf(dateKeyValue:string){return dateKeyValue.slice(0,7);}
function shiftMonth(month:string,step:number){
  const [year,number]=month.split("-").map(Number);
  return new Date(Date.UTC(year,number-1+step,1)).toISOString().slice(0,7);
}
function calendarDates(month:string){
  const [year,number]=month.split("-").map(Number);
  const firstWeekday=new Date(Date.UTC(year,number-1,1)).getUTCDay();
  const daysInMonth=new Date(Date.UTC(year,number,0)).getUTCDate();
  const dates:(string|null)[]=[
    ...Array.from({length:firstWeekday},()=>null),
    ...Array.from({length:daysInMonth},(_,i)=>`${month}-${String(i+1).padStart(2,"0")}`),
  ];
  while(dates.length%7!==0)dates.push(null);
  return dates;
}
function hour(value:string){
  return new Intl.DateTimeFormat("ko-KR",{
    timeZone:"Asia/Seoul",hour:"numeric",minute:"2-digit",hour12:true,
  }).format(new Date(value));
}
export default function OneDayClassCalendar<T extends ClassItem>({classes,renderClass}:Props<T>){
  const today=dateKey(new Date().toISOString());
  const [month,setMonth]=useState(monthOf(today));
  const [selectedDay,setSelectedDay]=useState(today);
  const days=useMemo(()=>calendarDates(month),[month]);
  const byDay=useMemo(()=>{
    const grouped=new Map<string,T[]>();
    for(const item of classes){
      const day=dateKey(item.start_at);
      const group=grouped.get(day)||[];
      group.push(item);
      grouped.set(day,group);
    }
    for(const group of grouped.values())group.sort((a,b)=>a.start_at.localeCompare(b.start_at));
    return grouped;
  },[classes]);
  const monthCount=classes.filter(item=>monthOf(dateKey(item.start_at))===month).length;
  const todayClasses=byDay.get(selectedDay)||[];
  function moveMonth(delta:number){
    const next=shiftMonth(month,delta);
    setMonth(next);
    setSelectedDay(next===monthOf(today)?today:next+"-01");
  }

  return (
    <section className="card adminOneDayCalendar" aria-label="원데이 클래스 월별 달력">
      <div className="adminOneDayCalendarTitle">
        <div><p className="adminEyebrow">월별 수업 기록</p><h2>원데이 클래스 달력</h2></div>
        <button type="button" onClick={()=>{
          setMonth(monthOf(today));setSelectedDay(today);
        }}>오늘</button>
      </div>
      <div className="adminOneDayCalendarNav">
        <button type="button" aria-label="이전 달" onClick={()=>moveMonth(-1)}>
          <ChevronLeft size={21}/>
        </button>
        <strong>{month.slice(0,4)}년 {Number(month.slice(5))}월</strong>
        <button type="button" aria-label="다음 달" onClick={()=>moveMonth(1)}>
          <ChevronRight size={21}/>
        </button>
      </div>
      <div className="adminOneDayWeekdays" aria-hidden="true">
        {["일","월","화","수","목","금","토"].map(day=><span key={day}>{day}</span>)}
      </div>
      <div className="adminOneDayDays" role="group" aria-label="월별 원데이 클래스 날짜">
        {days.map((day,i)=>day?(
          <button key={day} type="button"
            className={`${day===selectedDay?"selected":""} ${day===today?"today":""}`}
            aria-label={`${day} 원데이 클래스 ${(byDay.get(day)||[]).length}개`}
            aria-pressed={day===selectedDay}
            onClick={()=>setSelectedDay(day)}>
            <strong>{Number(day.slice(-2))}</strong>
            {(byDay.get(day)||[]).length>0 && <i className="adminOneDayDayDot" aria-hidden="true"/>}
          </button>
        ):<span key={`empty-${i}`}/>)}
      </div>
      <p className="adminOneDayMonthCount">이달 등록된 원데이 클래스 <b>{monthCount}개</b> · 과거 기록도 월을 바꿔 확인하세요.</p>
      <div className="adminOneDaySelectedDay">
        <h3><CalendarDays size={18}/>{selectedDay.replace(/-/g,". ")} <small>{todayClasses.length}개</small></h3>
        {todayClasses.length===0
          ?<p className="adminOneDayEmpty">이 날짜에 등록된 수업이 없습니다.</p>
          :<div className="adminOneDaySelectedList">
            {todayClasses.map(item=>(
              <div className="adminOneDaySelectedItem" key={item.id}>
                <div className="adminOneDaySelectedItemHeading">
                  <b>{item.title}</b>
                  <span>{hour(item.start_at)}~{hour(item.end_at)}</span>
                </div>
                {renderClass(item)}
              </div>
            ))}
          </div>}
      </div>
    </section>
  );
}
