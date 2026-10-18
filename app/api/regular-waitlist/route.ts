import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const studentId = new URL(request.url).searchParams.get("studentId");
    if (!studentId) return NextResponse.json({ waitlist: [] });
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("regular_waitlist")
      .select("id,slot_id,student_id,status,created_at,available_slots(start_at,end_at)")
      .eq("student_id",studentId).eq("status","waiting").order("created_at",{ascending:true});
    if (error) throw error;
    const ids = Array.from(new Set((data || []).map((w) => String(w.slot_id))));
    const positions = new Map<string, number>();
    if (ids.length) {
      const { data: queue, error: queueError } = await db.from("regular_waitlist")
        .select("id,slot_id").in("slot_id",ids).eq("status","waiting")
        .order("created_at",{ascending:true}).order("id",{ascending:true});
      if (queueError) throw queueError;
      const counters = new Map<string, number>();
      for (const item of queue || []) {
        const key=String(item.slot_id);
        const next=(counters.get(key)||0)+1;
        counters.set(key,next);
        positions.set(String(item.id),next);
      }
    }
    return NextResponse.json({waitlist:(data || []).map(w=>({...w,position:positions.get(String(w.id))||1}))});
  } catch(error) {
    return NextResponse.json({message:error instanceof Error?error.message:"대기 내역을 불러오지 못했습니다."},{status:500});
  }
}

export async function POST(request: Request) {
  try {
    const body=await request.json();
    const db=getSupabaseAdmin();
    if (!body.studentId) return NextResponse.json({message:"수강생 정보가 없습니다."},{status:400});
    const action=String(body.action||"join");
    if (action==="cancel") {
      if (!body.waitId) return NextResponse.json({message:"대기 번호를 확인해 주세요."},{status:400});
      const {data,error}=await db.rpc("munjang_regular_waitlist_cancel",{
        p_wait_id:String(body.waitId),p_student_id:String(body.studentId)
      });
      if(error) throw error;
      return NextResponse.json(data);
    }
    if (!body.slotId) return NextResponse.json({message:"수업 시간이 없습니다."},{status:400});
    const {data,error}=await db.rpc("munjang_regular_waitlist_join_v2",{
      p_slot_id:String(body.slotId),p_student_id:String(body.studentId),
      p_preferred_lifestyle:body.lifestyleClassName || null
    });
    if(error) throw error;
    return NextResponse.json(data);
  } catch(error) {
    return NextResponse.json({message:error instanceof Error?error.message:"대기 신청에 실패했습니다."},{status:400});
  }
}
