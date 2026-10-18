import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

type Body = {
  action?: string; studentId?: string; name?: string; phoneLast4?: string;
  endpoint?: string; subscription?: {
    endpoint?: string; expirationTime?: number | null;
    keys?: { p256dh?: string; auth?: string };
  };
  notificationId?: string;
};

export async function POST(request: Request) {
  try {
    const body: Body = await request.json();
    const studentId = String(body.studentId || "");
    const name = String(body.name || "").trim();
    const phoneLast4 = String(body.phoneLast4 || "");
    if (!studentId || !name || !/^\d{4}$/.test(phoneLast4)) {
      return NextResponse.json({message:"수강생 정보를 확인해 주세요."},{status:400});
    }
    const db = getSupabaseAdmin();
    const { data: student, error: studentError } = await db.from("students")
      .select("id").eq("id",studentId).eq("name",name)
      .eq("phone_last4",phoneLast4).eq("is_active",true).maybeSingle();
    if (studentError) throw studentError;
    if (!student) return NextResponse.json({message:"수강생 정보가 일치하지 않습니다."},{status:403});

    const action = String(body.action || "list");
    if (action === "list") {
      const {data,error} = await db.from("student_notifications")
        .select("id,kind,title,body,target_url,created_at,read_at")
        .eq("student_id",studentId).order("created_at",{ascending:false}).limit(50);
      if (error) throw error;
      return NextResponse.json({notifications:data || []});
    }
    if (action === "subscribe") {
      const sub = body.subscription;
      const endpoint = String(sub?.endpoint || "");
      const parsed = new URL(endpoint);
      if (parsed.protocol !== "https:" || endpoint.length > 2048 ||
        !sub?.keys?.auth || !sub.keys.p256dh) {
        return NextResponse.json({message:"알림 구독 정보가 올바르지 않습니다."},{status:400});
      }
      const {error} = await db.from("student_push_subscriptions").upsert({
        student_id:studentId,endpoint,subscription:sub,updated_at:new Date().toISOString(),
      },{onConflict:"endpoint"});
      if (error) throw error;
      return NextResponse.json({ok:true});
    }
    if (action === "unsubscribe") {
      const {error} = await db.from("student_push_subscriptions").delete()
        .eq("student_id",studentId).eq("endpoint",String(body.endpoint || ""));
      if (error) throw error;
      return NextResponse.json({ok:true});
    }
    if (action === "mark_read") {
      const {error} = await db.from("student_notifications")
        .update({read_at:new Date().toISOString()})
        .eq("id",String(body.notificationId || "")).eq("student_id",studentId);
      if(error) throw error;
      return NextResponse.json({ok:true});
    }
    return NextResponse.json({message:"지원하지 않는 알림 요청입니다."},{status:400});
  } catch(error) {
    const message=error instanceof Error ? error.message : "알림 처리 중 오류가 발생했습니다.";
    return NextResponse.json({message},{status:500});
  }
}
