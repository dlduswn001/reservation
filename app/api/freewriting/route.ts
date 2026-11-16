import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { getErrorMessage } from "../../../lib/supabaseCompat";
export const dynamic="force-dynamic";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVE=["booked","등록완료","등록대기","입금대기","입금완료"];

export async function GET(request:Request) {
 try {
  const db=getSupabaseAdmin();
  const id=new URL(request.url).searchParams.get("studentId");
  const {data:classes,error}=await db.from("oneday_classes")
    .select("id,title,description,start_at,end_at,capacity,is_open")
    .eq("class_kind","freewriting").eq("is_open",true)
    .gte("end_at",new Date().toISOString()).order("start_at",{ascending:true});
  if(error)throw error;
  const ids=(classes||[]).map(c=>c.id);
  if(!ids.length)return NextResponse.json({sessions:[]});
  const {data:bookings,error:be}=await db.from("oneday_bookings")
    .select("id,class_id,people_count,status,student_id").in("class_id",ids);
  if(be)throw be;
  const sessions=(classes||[]).map(c=>({
    id:c.id,title:c.title,description:c.description,start_at:c.start_at,end_at:c.end_at,capacity:c.capacity,
    booked_count:(bookings||[]).filter(b=>b.class_id===c.id&&ACTIVE.includes(b.status))
      .reduce((n,b)=>n+Number(b.people_count||1),0),
    my_booking:id&&UUID.test(id)?(bookings||[]).find(b=>b.class_id===c.id&&b.student_id===id&&b.status==="등록완료")?.id||null:null
  }));
  return NextResponse.json({sessions},{headers:{"Cache-Control":"no-store"}});
 } catch{return NextResponse.json({message:"프리 라이팅 클럽 일정을 불러오지 못했습니다."},{status:500});}
}
export async function POST(request:Request){
 try {
  const data=await request.json();
  const studentId=String(data.studentId||"");
  const bookingId=String(data.bookingId||"");
  const classId=String(data.classId||"");
  const name=String(data.name||"").trim();
  const phone=String(data.phone_last4||"");
  const action=String(data.action||"book");
  if(!UUID.test(studentId)||!name||!/^[0-9]{4}$/.test(phone)||
    (action==="book"&&!UUID.test(classId))||(action==="cancel"&&!UUID.test(bookingId)))
    return NextResponse.json({message:"신청 정보를 확인해 주세요."},{status:400});
  const db=getSupabaseAdmin();
  const {data:student,error:se}=await db.from("students")
    .select("id,lesson_duration_minutes,is_active,manual_enrollment_status")
    .eq("id",studentId).eq("name",name).eq("phone_last4",phone).maybeSingle();
  if(se)throw se;
  if(!student||!student.is_active||["paused","withdrawn"].includes(student.manual_enrollment_status||"")||
    ![45,90].includes(Number(student.lesson_duration_minutes)))
    return NextResponse.json({message:"45분 또는 90분 재원 수강생만 신청할 수 있습니다."},{status:403});
  if(!["book","cancel"].includes(action))return NextResponse.json({message:"올바르지 않은 요청입니다."},{status:400});
  const {data:result,error}=await db.rpc(action==="cancel"?"munjang_freewriting_cancel":"munjang_freewriting_book",
    action==="cancel"?{p_booking_id:bookingId,p_student_id:studentId}:{p_class_id:classId,p_student_id:studentId});
  if(error)throw error;
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch(e){return NextResponse.json({message:getErrorMessage(e)},{status:400});}
}
