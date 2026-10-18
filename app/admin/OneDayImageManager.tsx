"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Save, Star, Trash2 } from "lucide-react";

type GalleryPhoto = {
  id: string;
  class_id: string;
  caption: string;
  sort_order: number;
  is_cover: boolean;
  public_url: string;
};
type GalleryResponse = { ok?: boolean; photos?: GalleryPhoto[]; photo?: GalleryPhoto; message?: string; warning?: string };
const MAX_PHOTOS = 5;
const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
const SAFE_UPLOAD_BYTES = 3.6 * 1024 * 1024;
const SUPPORTED = new Set(["image/jpeg","image/png","image/webp"]);

function sortPhotos(a:GalleryPhoto,b:GalleryPhoto) {
  return a.sort_order-b.sort_order || a.id.localeCompare(b.id);
}

// Mobile photographs are often HEIC or larger than the Vercel function body
// limit. Convert locally to a compact JPEG before sending private admin upload.
async function preparePhoto(file: File): Promise<File> {
  if (file.size <= 0 || file.size > MAX_ORIGINAL_BYTES)
    throw new Error("사진은 한 장당 최대 15MB까지 선택할 수 있습니다.");
  if (SUPPORTED.has(file.type) && file.size <= SAFE_UPLOAD_BYTES) return file;

  const url=URL.createObjectURL(file);
  const image=new Image();
  try {
    await new Promise<void>((resolve,reject)=>{
      image.onload=()=>resolve();
      image.onerror=()=>reject(new Error("이 사진은 변환할 수 없습니다. JPG 또는 PNG로 저장해 주세요."));
      image.src=url;
    });
    const naturalWidth=image.naturalWidth;
    const naturalHeight=image.naturalHeight;
    if(!naturalWidth || !naturalHeight)throw new Error("사진 크기를 읽지 못했습니다.");
    const scale=Math.min(1,1600/Math.max(naturalWidth,naturalHeight));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(naturalHeight*scale));
    const ctx=canvas.getContext("2d");
    if(!ctx)throw new Error("사진 변환을 시작할 수 없습니다.");
    ctx.fillStyle="#fff";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);

    const encode = async (quality:number) =>
      new Promise<Blob>((resolve,reject)=>
        canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("사진을 압축하지 못했습니다.")),
          "image/jpeg",quality));
    let blob=await encode(.84);
    if(blob.size > SAFE_UPLOAD_BYTES) blob=await encode(.66);
    if(blob.size > SAFE_UPLOAD_BYTES) throw new Error("사진 용량이 너무 큽니다. 사진을 줄여 다시 시도해 주세요.");
    return new File([blob],file.name.replace(/\.[^.]+$/,"")+".jpg",{type:"image/jpeg"});
  }finally{
    URL.revokeObjectURL(url);
  }
}

export default function OneDayImageManager({
  classId,password,
}: {classId:string;password:string}) {
  const [photos,setPhotos]=useState<GalleryPhoto[]>([]);
  const [captions,setCaptions]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);
    setMessage("");
    void (async()=>{
      try{
        const res=await fetch("/api/admin/oneday/images",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({password,action:"list",class_id:classId}),
          cache:"no-store",
        });
        const data=await res.json() as GalleryResponse;
        if(!res.ok)throw new Error(data.message||"참고 사진을 불러오지 못했습니다.");
        if(!cancelled){
          const sorted=[...(data.photos||[])].sort(sortPhotos);
          setPhotos(sorted);
          setCaptions(Object.fromEntries(sorted.map(p=>[p.id,p.caption||""])));
        }
      }catch(error){
        if(!cancelled)setMessage(error instanceof Error?error.message:"참고 사진을 불러오지 못했습니다.");
      }finally{
        if(!cancelled)setLoading(false);
      }
    })();
    return()=>{cancelled=true};
  },[classId,password]);

  function updateList(next:GalleryPhoto[]){
    const sorted=[...next].sort(sortPhotos);
    setPhotos(sorted);
    setCaptions(Object.fromEntries(sorted.map(p=>[p.id,p.caption||""])));
  }
  async function changePhoto(action:string,photoId:string,payload:Record<string,unknown>={}){
    setBusy(true);
    setMessage("");
    try{
      const res=await fetch("/api/admin/oneday/images",{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({password,photo_id:photoId,action,...payload}),
      });
      const data=await res.json() as GalleryResponse;
      if(!res.ok)throw new Error(data.message||"사진을 수정하지 못했습니다.");
      updateList(data.photos||[]);
      setMessage(action==="cover"?"대표 사진을 변경했습니다."
        :action==="caption"?"사진 설명을 저장했습니다.":"사진 순서를 변경했습니다.");
    }catch(error){
      setMessage(error instanceof Error?error.message:"사진을 수정하지 못했습니다.");
    }finally{
      setBusy(false);
    }
  }
  async function removePhoto(photo:GalleryPhoto){
    if(!window.confirm("이 참고 사진을 삭제할까요? 수강생 화면에서도 사라집니다."))return;
    setBusy(true);setMessage("");
    try{
      const res=await fetch("/api/admin/oneday/images",{
        method:"DELETE",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({password,photo_id:photo.id}),
      });
      const data=await res.json() as GalleryResponse;
      if(!res.ok)throw new Error(data.message||"사진을 삭제하지 못했습니다.");
      updateList(data.photos||[]);
      setMessage(data.warning || "사진을 삭제했습니다.");
    }catch(error){
      setMessage(error instanceof Error?error.message:"사진을 삭제하지 못했습니다.");
    }finally{setBusy(false);}
  }
  async function uploadPhotos(e:ChangeEvent<HTMLInputElement>){
    const picked=Array.from(e.target.files||[]);
    e.target.value="";
    if(picked.length===0)return;
    if(photos.length+picked.length>MAX_PHOTOS){
      setMessage(`한 클래스에 최대 ${MAX_PHOTOS}장까지 첨부할 수 있습니다. 현재 ${photos.length}장입니다.`);
      return;
    }
    setBusy(true);setMessage("");
    let success=0;
    try{
      for(const file of picked){
        const prepared=await preparePhoto(file);
        const form=new FormData();
        form.set("password",password);
        form.set("class_id",classId);
        form.set("image",prepared);
        const res=await fetch("/api/admin/oneday/images",{method:"POST",body:form});
        const data=await res.json() as GalleryResponse;
        if(!res.ok)throw new Error(data.message||"이미지 업로드에 실패했습니다.");
        if(data.photo){
          setPhotos(cur=>[...cur,data.photo!].sort(sortPhotos));
          setCaptions(cur=>({...cur,[data.photo!.id]:data.photo!.caption||""}));
        }
        success++;
      }
      setMessage(`참고 사진 ${success}장을 등록했습니다. 필요하면 사진별 설명을 적어 주세요.`);
    }catch(error){
      const detail=error instanceof Error?error.message:"사진을 업로드하지 못했습니다.";
      setMessage(success?`${success}장은 등록했지만 다음 사진은 실패했습니다: ${detail}`:detail);
    }finally{setBusy(false);}
  }

  return (
    <section className="adminPhotoManager" aria-label="원데이 클래스 참고 이미지 관리">
      <h4>수강생 참고 사진 <span>{photos.length} / {MAX_PHOTOS}</span></h4>
      <p>완성 예시·준비물 사진을 첨부해 주세요. 대표 사진이 수강생 화면에서 먼저 표시됩니다.</p>
      {loading ? <p>사진을 불러오는 중...</p> : (
        <>
          {photos.length<MAX_PHOTOS && (
            <label className="adminPhotoUploadButton" aria-disabled={busy}>
              <ImagePlus size={17}/> {busy?"처리 중...":"참고 사진 추가"}
              <input aria-label="참고 사진 선택" type="file" multiple
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                disabled={busy} onChange={uploadPhotos}/>
            </label>
          )}
          <p>JPG·PNG·WebP 사진 · 큰 사진은 업로드 전에 자동으로 크기를 줄입니다.</p>
          {photos.length>0 && (
            <div className="adminPhotoGrid">
              {photos.map((photo,index)=>(
                <article className="adminPhotoItem" key={photo.id}>
                  <div className="adminPhotoThumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.public_url} alt={photo.caption||"원데이 클래스 참고 사진"} loading="lazy"/>
                    {photo.is_cover && <span className="adminPhotoCoverBadge">대표 사진</span>}
                  </div>
                  <div className="adminPhotoContent">
                    <label htmlFor={`caption-${photo.id}`}>사진 설명</label>
                    <input id={`caption-${photo.id}`} value={captions[photo.id]??photo.caption}
                      maxLength={100} placeholder="예: 완성 예시 또는 준비물"
                      disabled={busy}
                      onChange={event=>setCaptions(cur=>({...cur,[photo.id]:event.target.value}))}/>
                    <div className="adminPhotoActions">
                      <button type="button" disabled={busy || captions[photo.id]===photo.caption}
                        onClick={()=>void changePhoto("caption",photo.id,{caption:captions[photo.id]||""})}>
                        <Save size={13}/> 설명 저장
                      </button>
                      {!photo.is_cover && (
                        <button type="button" disabled={busy}
                          onClick={()=>void changePhoto("cover",photo.id)}>
                          <Star size={13}/> 대표 지정
                        </button>
                      )}
                      <button type="button" disabled={busy || index===0}
                        aria-label={`${index+1}번째 사진을 앞으로 이동`}
                        onClick={()=>void changePhoto("move",photo.id,{direction:-1})}>
                        <ArrowUp size={13}/> 위로
                      </button>
                      <button type="button" disabled={busy || index===photos.length-1}
                        aria-label={`${index+1}번째 사진을 뒤로 이동`}
                        onClick={()=>void changePhoto("move",photo.id,{direction:1})}>
                        <ArrowDown size={13}/> 아래로
                      </button>
                      <button type="button" className="delete" disabled={busy}
                        onClick={()=>void removePhoto(photo)}>
                        <Trash2 size={13}/> 삭제
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {message && <p className="adminPhotoFeedback" role="status">{message}</p>}
    </section>
  );
}
