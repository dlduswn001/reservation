import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export const fetchCache = "force-no-store";
export const revalidate = 0;
export const dynamic="force-dynamic";
export async function GET() {
 try {
  const {data,error}=await getSupabaseAdmin().from("school_announcements")
    .select("id,title,body,is_pinned,created_at")
    .eq("is_published",true)
    .order("is_pinned",{ascending:false})
    .order("created_at",{ascending:false}).limit(100);
  if(error) throw error;
  return NextResponse.json({notices:data||[]},{headers:{"Cache-Control":"no-store"}});
 } catch {return NextResponse.json({message:"공지사항을 불러오지 못했습니다."},{status:500});}
}
