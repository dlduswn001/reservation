import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const url = Deno.env.get("SUPABASE_URL")!;
const roleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, roleKey, { auth: { persistSession: false } });

function matchSecret(received: string, expected: string): boolean {
  if (!received || !expected || received.length !== expected.length) return false;
  let delta = 0;
  for (let i = 0; i < received.length; i++) delta |= received.charCodeAt(i) ^ expected.charCodeAt(i);
  return delta === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", {status:405});
  try {
    const { data: conf, error: configError } = await db.rpc("munjang_push_credentials");
    if (configError || !conf?.public_key || !conf?.private_key || !conf?.dispatch_token)
      return Response.json({ error: "Push not configured" }, { status: 503 });
    if (!matchSecret(request.headers.get("X-Munjang-Dispatch-Token") || "", conf.dispatch_token))
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    webpush.setVapidDetails("mailto:storidea@storidea.kr", conf.public_key, conf.private_key);

    const { data: batch, error: queueError } = await db.rpc("munjang_claim_push_notifications", { p_limit: 30 });
    if (queueError) throw queueError;
    let processed = 0;
    let sent = 0;
    let retry = 0;
    for (const item of batch || []) {
      if (item.kind === "three_hour_regular" && item.regular_booking_id) {
        const {data: booking} = await db.from("regular_bookings").select("status").eq("id",item.regular_booking_id).maybeSingle();
        if (booking?.status !== "booked") {
          await db.from("student_notifications").update({push_dispatched_at:new Date().toISOString()}).eq("id",item.id);
          processed++;
          continue;
        }
      }
      if (item.kind === "three_hour_oneday" && item.oneday_booking_id) {
        const {data: booking} = await db.from("oneday_bookings").select("status").eq("id",item.oneday_booking_id).maybeSingle();
        if (!["등록완료","입금완료"].includes(String(booking?.status || ""))) {
          await db.from("student_notifications").update({push_dispatched_at:new Date().toISOString()}).eq("id",item.id);
          processed++;
          continue;
        }
      }
      const {data: devices,error: devicesError} = await db.from("student_push_subscriptions")
        .select("endpoint,subscription").eq("student_id",item.student_id);
      if (devicesError) throw devicesError;
      let transientError = false;
      for (const device of devices || []) {
        const payload = JSON.stringify({
          title:item.title,
          body:item.body,
          url:item.target_url || "/regular",
          tag: String(item.kind) + ":" + String(item.id),
        });
        try {
          await webpush.sendNotification(device.subscription, payload, { TTL: 3600, urgency: "high" });
          sent++;
        } catch (error) {
          const statusCode = Number((error as {statusCode?:number})?.statusCode || 0);
          if (statusCode === 404 || statusCode === 410) {
            await db.from("student_push_subscriptions").delete().eq("endpoint",device.endpoint);
          } else {
            transientError = true;
            console.error("Web push error",statusCode,String((error as Error).message).slice(0,100));
          }
        }
      }
      if (!transientError) {
        await db.from("student_notifications")
          .update({push_dispatched_at:new Date().toISOString()}).eq("id",item.id);
        processed++;
      } else retry++;
    }
    return Response.json({ok:true,processed,sent,retry});
  } catch (error) {
    console.error("Push dispatch failed", (error as Error).message);
    return Response.json({error:"dispatch failed"}, {status:500});
  }
});