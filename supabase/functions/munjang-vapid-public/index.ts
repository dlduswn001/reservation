import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
  "Access-Control-Allow-Origin": "https://reservation.moonjang.site",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "GET")
    return Response.json({ message: "Method not allowed" }, { status: 405, headers });

  try {
    // This endpoint is intentionally public: Web Push public keys are not secrets.
    // The private key and dispatch token are NEVER returned to the browser.
    const { data, error } = await admin.rpc("munjang_push_credentials");
    if (error || !data?.public_key) {
      return Response.json({ message: "알림 설정을 불러오지 못했습니다." }, { status: 503, headers });
    }
    const publicKey = String(data.public_key).trim();
    if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey)) {
      return Response.json({ message: "알림 공개키 설정을 확인 중입니다." }, { status: 503, headers });
    }
    const base64 = publicKey.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Uint8Array.from(atob(base64.padEnd(88, "=")), (ch) => ch.charCodeAt(0));
    if (decoded.length !== 65 || decoded[0] !== 4) {
      return Response.json({ message: "알림 공개키 설정을 확인 중입니다." }, { status: 503, headers });
    }
    // The screenshot error arose because the previous 65-byte key was not on P-256.
    // WebCrypto verifies the point rather than merely checking its length.
    await crypto.subtle.importKey(
      "raw", decoded, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"],
    );
    return Response.json({ publicKey }, { headers });
  } catch {
    return Response.json({ message: "알림 키를 확인하지 못했습니다." }, { status: 503, headers });
  }
});