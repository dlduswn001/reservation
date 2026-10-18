"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Wallet, UserPlus, RotateCw } from "lucide-react";

type StudentRow = {
  id: string; name: string; created_at?: string;
};
type PaymentRow = {
  id: string; student_id: string; payment_date: string;
  registration_type: "new" | "renewal";
  amount_krw: number; credits_added: number; memo?: string;
};
type Props = {
  students: StudentRow[];
  registrations: PaymentRow[];
  onStudent: (studentId:string)=>void;
};

function monthForKoreanTime(value:string) {
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",
  }).formatToParts(new Date(value));
  const get=(t:string)=>parts.find(part=>part.type===t)?.value||"";
  return get("year")+"-"+get("month");
}
function thisMonth() { return monthForKoreanTime(new Date().toISOString()); }
function shiftMonth(month:string, delta:number) {
  const [y,m]=month.split("-").map(Number);
  const target=new Date(Date.UTC(y,m-1+delta,1));
  return target.toISOString().slice(0,7);
}
const won=(value:number)=>value.toLocaleString("ko-KR")+"원";

export default function MonthlyRegistrationReport({students,registrations,onStudent}:Props){
  const [month,setMonth]=useState(thisMonth);
  const summary=useMemo(()=>{
    const newStudents=students
      .filter(s=>s.created_at && monthForKoreanTime(s.created_at)===month)
      .sort((a,b)=>a.name.localeCompare(b.name,"ko"));
    const payments=registrations
      .filter(r=>r.payment_date.slice(0,7)===month)
      .sort((a,b)=>b.payment_date.localeCompare(a.payment_date));
    const renewals=payments.filter(p=>p.registration_type==="renewal");
    const newPayments=payments.filter(p=>p.registration_type==="new");
    const paid=(items:PaymentRow[])=>items.reduce((sum,p)=>sum+Number(p.amount_krw||0),0);
    return {
      newStudents,
      payments,
      renewals,
      total:paid(payments),
      newRevenue:paid(newPayments),
      renewalRevenue:paid(renewals),
      renewalPeople:new Set(renewals.map(r=>r.student_id)).size,
    };
  },[students,registrations,month]);
  const name=(id:string)=>students.find(s=>s.id===id)?.name||"등록된 수강생";

  return (
    <section className="card adminRevenueReport" aria-label="월별 신규 등록 재등록 및 매출">
      <div className="adminRevenueHeading">
        <div><p className="adminEyebrow">수강생 등록 분석</p><h2>월별 신규·재등록</h2></div>
        <div className="adminRevenueMonthControls">
          <button type="button" aria-label="이전 달" onClick={()=>setMonth(m=>shiftMonth(m,-1))}>
            <ChevronLeft size={18}/>
          </button>
          <strong>{month.slice(0,4)}년 {Number(month.slice(5))}월</strong>
          <button type="button" aria-label="다음 달" onClick={()=>setMonth(m=>shiftMonth(m,1))}>
            <ChevronRight size={18}/>
          </button>
        </div>
      </div>
      <div className="adminRevenueStats">
        <div><UserPlus size={17}/><span>신규 등록</span><strong>{summary.newStudents.length}명</strong></div>
        <div><RotateCw size={17}/><span>재등록</span><strong>{summary.renewalPeople}명</strong></div>
        <div className="wide"><Wallet size={17}/><span>기록된 수강료 매출</span><strong>{won(summary.total)}</strong></div>
      </div>
      <div className="adminRevenueBreakdown">
        <span>신규 결제 {won(summary.newRevenue)}</span>
        <span>재등록 결제 {won(summary.renewalRevenue)}</span>
        <span>재등록 {summary.renewals.length}건</span>
      </div>
      <details className="adminRevenueDetails">
        <summary>신규 등록자 {summary.newStudents.length}명 확인</summary>
        {summary.newStudents.length===0?<p>이달 새로 등록한 수강생이 없습니다.</p>:
          <div className="adminRevenueNames">
            {summary.newStudents.map(s=><button type="button" key={s.id} onClick={()=>onStudent(s.id)}>{s.name}</button>)}
          </div>}
      </details>
      <details className="adminRevenueDetails">
        <summary>수강료·재등록 기록 {summary.payments.length}건 확인</summary>
        {summary.payments.length===0?<p>이달 입력한 결제 내역이 없습니다.</p>:
          <div className="adminRevenueTransactions">
            {summary.payments.map(p=>(
              <button type="button" key={p.id} onClick={()=>onStudent(p.student_id)}>
                <span><b>{name(p.student_id)}</b> · {p.registration_type==="new"?"신규":"재등록"}</span>
                <span>{p.payment_date} · {won(p.amount_krw)} · +{p.credits_added}회</span>
              </button>
            ))}
          </div>}
      </details>
      <p className="adminRevenueNote">
        매출은 관리자에게 결제금액을 입력한 건만 합산합니다.
        기존 수강생의 과거 결제 내역과 수강권 단순 수정은 매출로 추정하지 않습니다.
        신규 등록 인원은 앱에 수강생이 등록된 날짜 기준입니다.
      </p>
    </section>
  );
}
