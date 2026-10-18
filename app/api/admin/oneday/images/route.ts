import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET = "munjang-oneday-gallery";
const MAX_PHOTOS = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { "Cache-Control": "private, no-store, max-age=0" };
const FIELDS = "id,class_id,storage_path,caption,sort_order,is_cover,created_at";

type GalleryPhoto = {
  id:string;class_id:string;storage_path:string;caption:string;sort_order:number;is_cover:boolean;
  created_at?:string;
};
type AdminBody = Record<string, unknown>;

function json(body: Record<string,unknown>, status = 200) {
  return NextResponse.json(body,{status,headers});
}
function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  return "이미지 처리 중 오류가 발생했습니다.";
}
function formatPhotos(photos: GalleryPhoto[]) {
  const supabase = getSupabaseAdmin();
  return photos.map((photo)=>({
    id:photo.id,
    class_id:photo.class_id,
    caption:photo.caption || "",
    sort_order:photo.sort_order,
    is_cover:photo.is_cover,
    public_url:supabase.storage.from(BUCKET).getPublicUrl(photo.storage_path).data.publicUrl,
  }));
}
function photoOrder(a: GalleryPhoto,b: GalleryPhoto) {
  return a.sort_order - b.sort_order || a.id.localeCompare(b.id);
}
function identifyImage(bytes:Uint8Array) {
  if (bytes.length > 3 && bytes[0]===0xff && bytes[1]===0xd8 && bytes[2]===0xff)
    return {ext:"jpg",mime:"image/jpeg"};
  if (bytes.length > 8 && bytes[0]===0x89 && bytes[1]===0x50 && bytes[2]===0x4e && bytes[3]===0x47
    && bytes[4]===0x0d && bytes[5]===0x0a && bytes[6]===0x1a && bytes[7]===0x0a)
    return {ext:"png",mime:"image/png"};
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0,4))==="RIFF"
    && String.fromCharCode(...bytes.slice(8,12))==="WEBP")
    return {ext:"webp",mime:"image/webp"};
  return null;
}
async function classExists(classId:string) {
  const {data,error}=await getSupabaseAdmin().from("oneday_classes")
    .select("id,is_deleted").eq("id",classId).maybeSingle();
  if(error)throw error;
  return data && data.is_deleted !== true;
}
async function classPhotos(classId:string) {
  const {data,error}=await getSupabaseAdmin().from("oneday_class_images")
    .select(FIELDS).eq("class_id",classId)
    .order("sort_order",{ascending:true}).order("created_at",{ascending:true});
  if(error)throw error;
  return (data||[]) as GalleryPhoto[];
}

export async function POST(request:Request) {
  try {
    const contentType=request.headers.get("content-type")||"";
    if (contentType.includes("multipart/form-data")) {
      const form=await request.formData();
      if(!checkAdminPassword(form.get("password"))) {
        return json({message:getAdminPasswordErrorMessage()},401);
      }
      const classId=String(form.get("class_id")||"");
      const image=form.get("image");
      const caption=String(form.get("caption")||"").trim().slice(0,100);
      if(!UUID.test(classId) || !await classExists(classId))
        return json({message:"이미지를 추가할 원데이 클래스를 확인해 주세요."},400);
      if(!(image instanceof File))return json({message:"사진 파일을 선택해 주세요."},400);
      if(image.size <= 0 || image.size > MAX_BYTES)
        return json({message:"사진은 한 장당 최대 5MB입니다."},413);
      const bytes=new Uint8Array(await image.arrayBuffer());
      const format=identifyImage(bytes);
      if(!format)return json({message:"JPG, PNG, WebP 형식의 사진만 올릴 수 있습니다."},400);

      const supabase=getSupabaseAdmin();
      const existing=await classPhotos(classId);
      if(existing.length>=MAX_PHOTOS)
        return json({message:"한 클래스에 참고 사진은 최대 5장까지 첨부할 수 있습니다."},409);

      const path=`${classId}/${crypto.randomUUID()}.${format.ext}`;
      const uploaded=await supabase.storage.from(BUCKET).upload(path,bytes,{
        contentType:format.mime,
        cacheControl:"3600",
        upsert:false,
      });
      if(uploaded.error)throw uploaded.error;
      const {data,error}=await supabase.from("oneday_class_images")
        .insert({
          class_id:classId,storage_path:path,caption,
          sort_order:existing.length?Math.max(...existing.map((p)=>p.sort_order))+1:0,
          is_cover:existing.length===0,
        })
        .select(FIELDS).single();
      if(error){
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
      return json({ok:true,photo:formatPhotos([data as GalleryPhoto])[0]});
    }

    const body=await request.json() as AdminBody;
    if(!checkAdminPassword(body.password))
      return json({message:getAdminPasswordErrorMessage()},401);
    if(body.action !== "list")
      return json({message:"지원하지 않는 요청입니다."},400);
    const supabase=getSupabaseAdmin();
    const targetClassId = String(body.class_id || "");
    if (targetClassId && !UUID.test(targetClassId)) {
      return json({message:"원데이 클래스 정보가 올바르지 않습니다."},400);
    }
    let query = supabase.from("oneday_class_images").select(FIELDS);
    if (targetClassId) query = query.eq("class_id",targetClassId);
    const {data,error}=await query.order("sort_order",{ascending:true})
      .order("created_at",{ascending:true}).limit(500);
    if(error)throw error;
    return json({photos:formatPhotos((data||[]) as GalleryPhoto[])});
  }catch(error){
    return json({message:messageOf(error)},500);
  }
}

export async function PATCH(request:Request) {
  try{
    const body=await request.json() as AdminBody;
    if(!checkAdminPassword(body.password))
      return json({message:getAdminPasswordErrorMessage()},401);
    const photoId=String(body.photo_id||"");
    const action=String(body.action||"");
    if(!UUID.test(photoId))return json({message:"수정할 사진을 찾을 수 없습니다."},400);
    const supabase=getSupabaseAdmin();
    const {data:original,error:readError}=await supabase.from("oneday_class_images")
      .select(FIELDS).eq("id",photoId).maybeSingle();
    if(readError)throw readError;
    if(!original)return json({message:"수정할 사진이 없습니다."},404);
    const photo=original as GalleryPhoto;
    const existing=await classPhotos(photo.class_id);
    if(action==="caption"){
      const caption=String(body.caption||"").trim().slice(0,100);
      const {error}=await supabase.from("oneday_class_images")
        .update({caption}).eq("id",photoId);
      if(error)throw error;
    }else if(action==="cover"){
      // Move away from the old cover first to satisfy the partial unique index.
      const {error:clearError}=await supabase.from("oneday_class_images")
        .update({is_cover:false}).eq("class_id",photo.class_id).eq("is_cover",true);
      if(clearError)throw clearError;
      const {error}=await supabase.from("oneday_class_images")
        .update({is_cover:true}).eq("id",photoId);
      if(error)throw error;
    }else if(action==="move"){
      const direction=Number(body.direction);
      if(direction!==-1 && direction!==1)return json({message:"사진 이동 방향을 확인해 주세요."},400);
      const index=existing.findIndex((p)=>p.id===photoId);
      const neighbor=existing[index+direction];
      if(index<0 || !neighbor)return json({ok:true,photos:formatPhotos(existing)});
      // sort_order has no uniqueness constraint, so swapping is safe.
      const {error:firstError}=await supabase.from("oneday_class_images")
        .update({sort_order:neighbor.sort_order}).eq("id",photoId);
      if(firstError)throw firstError;
      const {error:secondError}=await supabase.from("oneday_class_images")
        .update({sort_order:photo.sort_order}).eq("id",neighbor.id);
      if(secondError)throw secondError;
    }else return json({message:"지원하지 않는 사진 관리 요청입니다."},400);
    return json({ok:true,photos:formatPhotos(await classPhotos(photo.class_id))});
  }catch(error){return json({message:messageOf(error)},500);}
}

export async function DELETE(request:Request) {
  try{
    const body=await request.json() as AdminBody;
    if(!checkAdminPassword(body.password))
      return json({message:getAdminPasswordErrorMessage()},401);
    const photoId=String(body.photo_id||"");
    if(!UUID.test(photoId))return json({message:"삭제할 사진을 선택해 주세요."},400);
    const supabase=getSupabaseAdmin();
    const {data,error:findError}=await supabase.from("oneday_class_images")
      .select(FIELDS).eq("id",photoId).maybeSingle();
    if(findError)throw findError;
    if(!data)return json({message:"이미 삭제된 사진입니다."},404);
    const photo=data as GalleryPhoto;
    const {error}=await supabase.from("oneday_class_images").delete().eq("id",photoId);
    if(error)throw error;
    // Storage cleanup after database deletion avoids leaving broken public
    // image references in the student app if storage temporarily fails.
    const deleted=await supabase.storage.from(BUCKET).remove([photo.storage_path]);
    const remaining=await classPhotos(photo.class_id);
    if(photo.is_cover && remaining.length>0){
      const {error:coverError}=await supabase.from("oneday_class_images")
        .update({is_cover:true}).eq("id",remaining[0].id);
      if(coverError)throw coverError;
    }
    return json({
      ok:true,
      photos:formatPhotos(await classPhotos(photo.class_id)),
      ...(deleted.error?{warning:"사진은 목록에서 삭제됐지만 파일 정리는 나중에 다시 확인해 주세요."}:{}),
    });
  }catch(error){return json({message:messageOf(error)},500);}
}
