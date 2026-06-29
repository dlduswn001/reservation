import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !url.startsWith("http")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL이 올바르지 않습니다. Vercel 환경변수 Value에 https://...supabase.co 주소만 넣어주세요.");
  }

  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY가 없습니다. Vercel 환경변수에 추가해주세요.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
