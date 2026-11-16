import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
export const dynamic="force-dynamic";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields="id,title,body,is_published,is_pinned,created_at,updated_at";
function validate(raw:any){
 const title=typeof raw?.title==="string"?raw.title.trim():"";
 const body=typeof raw?.body==="string"?raw.body.trim():"";
 if(!title||title.length>160||!body||body.length>12000||typeof raw?.is_published!=="boolean"||typeof raw?.is_pinned!=="boolean")return null;
 return {title,body,is_published:raw.is_published,is_pinned:raw.is_pinned};
}
export async function POST(request:Request){
 try {
  const input=await request.json();
  if(!checkAdminPassword(input?.password))return NextResponse.json({message:getAdminPasswordErrorMessage()},{status:401});
  const db=getSupabaseAdmin();
  if(input.action==="list"){
   const {data,error}=await db.from("school_announcements").select(fields).order("created_at",{ascending:false}).limit(250);
   if(error)throw error;
   return NextResponse.json({notices:data||[]},{headers:{"Cache-Control":"private, no-store"}});
  }
  if(input.action==="create"){
   const item=validate(input.notice);
   if(!item)return NextResponse.json({message:"제목, 본문, 공개 상태를 확인해 주세요."},{status:400});
   const {data,error}=await db.from("school_announcements").insert(item).select(fields).single();
   if(error)throw error;
   return NextResponse.json({notice:data});
  }
  if(input.action==="update"){
   if(!UUID.test(String(input.id||"")))return NextResponse.json({message:"공지 ID가 올바르지 않습니다."},{status:400});
   const item=validate(input.notice);
   if(!item)return NextResponse.json({message:"공지 내용을 확인해 주세요."},{status:400});
   const {data,error}=await db.from("school_announcements").update({...item,updated_at:new Date().toISOString()})
    .eq("id",input.id).select(fields).maybeSingle();
   if(error)throw error;
   if(!data)return NextResponse.json({message:"공지를 찾을 수 없습니다."},{status:404});
   return NextResponse.json({notice:data});
  }
  if(input.action==="delete"){
   if(!UUID.test(String(input.id||"")))return NextResponse.json({message:"공지 ID가 올바르지 않습니다."},{status:400});
   const {error}=await db.from("school_announcements").delete().eq("id",input.id);
   if(error)throw error;
   return NextResponse.json({success:true});
  }
  return NextResponse.json({message:"올바른 요청이 아닙니다."},{status:400});
 }catch{return NextResponse.json({message:"공지사항 저장 중 오류가 발생했습니다."},{status:500});}
}
