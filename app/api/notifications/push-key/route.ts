import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

// This endpoint reads a VAPID key from Supabase Vault.
// Never prerender or CDN-cache it: keys may be corrected/rotated independently
// of a Vercel deployment.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const noCacheHeaders = {
  "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET() {
  try {
    const {data,error} = await getSupabaseAdmin().rpc("munjang_push_credentials");
    if(error) throw error;
    if(!data?.public_key) return NextResponse.json({message:"푸시 알림 준비 중입니다."},{status:503,headers:noCacheHeaders});
    const publicKey = String(data.public_key).trim();
    // Uncompressed P-256 points are 0x04 + two 32-byte coordinates.
    // Reject broken/incorrectly encoded values rather than passing them
    // through to iPhone's PushManager.subscribe().
    if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey)) {
      return NextResponse.json({message:"알림 공개키 설정을 확인하고 있습니다."},{status:503,headers:noCacheHeaders});
    }
    const raw = Buffer.from(publicKey.replace(/-/g,"+").replace(/_/g,"/"),"base64");
    if (raw.length!==65 || raw[0]!==4) {
      return NextResponse.json({message:"알림 공개키 설정을 확인하고 있습니다."},{status:503,headers:noCacheHeaders});
    }
    return NextResponse.json({publicKey},{headers:noCacheHeaders});
  } catch {
    return NextResponse.json({message:"알림 키를 불러오지 못했습니다."},{status:500,headers:noCacheHeaders});
  }
}
