"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "../components/BottomNav";

type Login = {id: string; name: string; phone_last4: string};
type Notice = {id:string;kind:string;title:string;body:string;target_url:string;created_at:string;read_at:string|null};
const LOGIN_KEY="munjangStudentLogin";

function readLogin(): Login | null {
  try {
    const item=JSON.parse(localStorage.getItem(LOGIN_KEY)||"null");
    return item?.id && item?.name && /^\d{4}$/.test(String(item.phone_last4||""))
      ? {id:item.id,name:item.name,phone_last4:item.phone_last4} : null;
  } catch {return null;}
}
function decodeBase64Url(value:string) {
  const base64=value.replace(/-/g,"+").replace(/_/g,"/");
  const str=atob(base64.padEnd(Math.ceil(base64.length/4)*4,"="));
  return Uint8Array.from(str,character=>character.charCodeAt(0));
}
function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if(!a) return false;
  const previous=new Uint8Array(a);
  return previous.length===b.length && previous.every((byte,i)=>byte===b[i]);
}
function kstTime(value:string) {
  return new Intl.DateTimeFormat("ko-KR",{
    timeZone:"Asia/Seoul",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",
  }).format(new Date(value));
}

export default function NotificationPage() {
  const [login,setLogin]=useState<Login|null>(null);
  const [items,setItems]=useState<Notice[]>([]);
  const [enabled,setEnabled]=useState(false);
  const [supported,setSupported]=useState(true);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState("");

  const fetchNotices=useCallback(async (person:Login) => {
    const res=await fetch("/api/notifications",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"list",studentId:person.id,name:person.name,phoneLast4:person.phone_last4}),
      cache:"no-store",
    });
    const result=await res.json();
    if(!res.ok) throw Error(result.message||"알림 내역을 불러오지 못했습니다.");
    setItems(result.notifications||[]);
  },[]);

  useEffect(()=>{
    const saved=readLogin();
    setLogin(saved);
    if(saved) fetchNotices(saved).catch(e=>setMessage(e.message));
    const ok=typeof window!=="undefined" && "serviceWorker" in navigator
      && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if(ok) navigator.serviceWorker.ready
      .then(reg=>reg.pushManager.getSubscription())
      .then(sub=>setEnabled(Boolean(sub && Notification.permission==="granted")))
      .catch(()=>setEnabled(false));
  },[fetchNotices]);

  async function changePush(enable:boolean) {
    if(!login) return;
    setLoading(true);setMessage("");
    try {
      if(!supported) throw Error("이 브라우저에서는 푸시 알림을 지원하지 않습니다.");
      const registration=await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();
      if(enable){
        const permission=await Notification.requestPermission();
        if(permission!=="granted") throw Error("휴대폰 또는 브라우저 설정에서 알림을 허용해 주세요.");
        // Always check the current server key, including when this device
        // already has an older subscription. A stale VAPID key may silently
        // leave notifications enabled but undeliverable.
        const keyResult=await fetch("/api/notifications/push-key",{cache:"no-store"});
        const keyJson=await keyResult.json();
        if(!keyResult.ok) throw Error(keyJson.message||"알림 설정을 불러오지 못했습니다.");
        const key=decodeBase64Url(String(keyJson.publicKey||""));
        if(key.length!==65 || key[0]!==4)
          throw Error("문장학교 알림 공개키 설정이 올바르지 않습니다. 관리자에게 문의해 주세요.");
        if(subscription && !sameKey(subscription.options.applicationServerKey,key)){
          // Unregister an old key on this device before subscribing with the
          // current key; otherwise the push service will keep the old key.
          const oldEndpoint=subscription.endpoint;
          const unregistered=await subscription.unsubscribe();
          if(!unregistered) throw Error("이전 알림 설정을 해제하지 못했습니다. 다시 시도해 주세요.");
          await fetch("/api/notifications",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({action:"unsubscribe",studentId:login.id,name:login.name,
              phoneLast4:login.phone_last4,endpoint:oldEndpoint}),
          }).catch(()=>undefined);
          subscription=null;
        }
        if(!subscription){
          subscription=await registration.pushManager.subscribe({
            userVisibleOnly:true,applicationServerKey:key,
          });
        }
        const res=await fetch("/api/notifications",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({action:"subscribe",studentId:login.id,name:login.name,
            phoneLast4:login.phone_last4,subscription:subscription.toJSON()}),
        });
        const json=await res.json();
        if(!res.ok) throw Error(json.message||"알림 구독에 실패했습니다.");
        setEnabled(true);
        setMessage("알림을 켰습니다. 수업 3시간 전과 대기 확정 시 휴대폰에 알림이 도착합니다.");
      }else{
        if(subscription){
          await fetch("/api/notifications",{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({action:"unsubscribe",studentId:login.id,name:login.name,
              phoneLast4:login.phone_last4,endpoint:subscription.endpoint}),
          });
          await subscription.unsubscribe();
        }
        setEnabled(false);setMessage("이 기기의 알림을 껐습니다.");
      }
    }catch(error) {
      setMessage(error instanceof Error ? error.message : "알림 설정을 변경하지 못했습니다.");
    }finally{setLoading(false);}
  }
  async function markRead(item:Notice) {
    if(!login||item.read_at) return;
    const res=await fetch("/api/notifications",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"mark_read",studentId:login.id,name:login.name,
        phoneLast4:login.phone_last4,notificationId:item.id}),
    });
    if(res.ok) setItems(curr=>curr.map(n=>n.id===item.id?{...n,read_at:new Date().toISOString()}:n));
  }

  return (
    <main className="container appContainer studioApp" style={{maxWidth:720,paddingBottom:110}}>
      <header className="studioPageHeader"><h1>알림</h1></header>
      {!login ? (
        <section className="card">
          <h2>수강생 로그인이 필요합니다.</h2>
          <p className="small">정규수업 예약 화면에서 로그인하면 알림을 설정할 수 있습니다.</p>
          <Link href="/regular" className="button">정규수업 예약으로 이동</Link>
        </section>
      ) : (
        <>
          <section className="card" style={{background:"#fff",border:"1px solid #ebebeb",borderRadius:16}}>
            <h2 style={{marginTop:0}}>휴대폰 알림</h2>
            <p style={{fontSize:14,lineHeight:1.7,color:"#666"}}>
              수업 시작 약 3시간 전, 또는 대기했던 정규수업이 예약 확정될 때 알려드립니다.
            </p>
            <button type="button" disabled={loading||(!supported&&!enabled)}
              onClick={()=>changePush(!enabled)}
              style={{width:"100%",borderRadius:10,background:enabled?"#f3f3f3":"#79283E",
                color:enabled?"#333":"#fff",padding:"13px 16px",border:0,marginTop:7,fontWeight:700}}>
              {loading?"설정 중…":enabled?"이 기기 알림 끄기":"이 기기에서 알림 켜기"}
            </button>
            <p className="small" style={{marginTop:12}}>
              알림은 기기마다 한 번씩 허용해야 합니다. 아이폰은 Safari에서 문장학교를 홈 화면에 추가한 뒤
              설치한 앱을 열어 허용해 주세요. 알림을 허용하지 않아도 예약은 이용할 수 있습니다.
            </p>
            {message && <p role="status" style={{fontSize:13,color:"#79283E"}}>{message}</p>}
          </section>
          <section className="card" style={{background:"#fff",border:"1px solid #ebebeb",borderRadius:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}>
              <h2 style={{margin:0}}>내 알림 내역</h2>
              <button type="button" className="secondary compact" onClick={()=>fetchNotices(login).catch(e=>setMessage(e.message))}>새로고침</button>
            </div>
            {items.length===0 ? <p style={{color:"#777",marginTop:18}}>아직 도착한 알림이 없습니다.</p> : (
              <div style={{display:"grid",gap:10,marginTop:16}}>
                {items.map(n=>(
                  <Link href={n.target_url||"/regular"} key={n.id}
                    onClick={()=>markRead(n)}
                    style={{display:"block",border:"1px solid #e9e6e6",borderRadius:12,padding:15,
                      background:n.read_at?"#fff":"#fbf6f7",textDecoration:"none",color:"#252525"}}>
                    <strong style={{fontSize:14}}>{n.title}</strong>
                    {!n.read_at && <span style={{fontSize:10,color:"#79283E",marginLeft:8}}>새 알림</span>}
                    <p style={{fontSize:13,color:"#555",margin:"8px 0"}}>{n.body}</p>
                    <small style={{color:"#888"}}>{kstTime(n.created_at)}</small>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      <BottomNav />
    </main>
  );
}
