import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { getErrorMessage } from "../../../../lib/supabaseCompat";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function send(body:Record<string,unknown>,status=200){
  return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:Request){
  try{
    const body=await request.json() as Record<string,unknown>;
    if(!checkAdminPassword(body.password)){
      return send({message:getAdminPasswordErrorMessage()},401);
    }
    const studentId=String(body.student_id||"");
    const date=String(body.payment_date||"");
    const type=String(body.registration_type||"renewal");
    const amount=Number(body.amount_krw);
    const credits=Number(body.credits_added);
    const memo=String(body.memo||"").trim().slice(0,500);
    const dateObject=new Date(date+"T00:00:00Z");
    if(!UUID.test(studentId)
      || !DAY.test(date) || Number.isNaN(dateObject.getTime())
      || dateObject.toISOString().slice(0,10)!==date
      || !["new","renewal"].includes(type)
      || !Number.isSafeInteger(amount) || amount<0
      || !Number.isFinite(credits) || credits<0 || credits>1000
      || (amount===0 && credits===0)){
      return send({message:"수강생, 등록일, 결제금액 및 추가 횟수를 확인해 주세요."},400);
    }
    // Record a payment and add purchased credits in a single DB transaction.
    // Manual credit edits remain separate and are NEVER interpreted as sales.
    const {data,error}=await getSupabaseAdmin().rpc("munjang_record_registration",{
      p_student_id:studentId,
      p_date:date,
      p_type:type,
      p_amount_krw:amount,
      p_credits_added:credits,
      p_memo:memo,
    });
    if(error)throw error;
    return send({ok:true,id:data});
  }catch(error){
    return send({message:getErrorMessage(error)},500);
  }
}
