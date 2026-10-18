import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function GET() {
  try {
    const {data,error} = await getSupabaseAdmin().rpc("munjang_push_credentials");
    if(error) throw error;
    if(!data?.public_key) return NextResponse.json({message:"푸시 알림 준비 중입니다."},{status:503});
    return NextResponse.json({publicKey:String(data.public_key)},{headers:{"Cache-Control":"public,max-age=3600"}});
  } catch {
    return NextResponse.json({message:"알림 키를 불러오지 못했습니다."},{status:500});
  }
}
