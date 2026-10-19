import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const CHANNELS = ["naver", "brunch", "instagram", "threads"] as const;
const FORMATS = ["post", "essay", "cardnews", "story", "notice"] as const;
const STATUSES = ["idea", "draft", "ready", "published"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FIELDS = "id,title,channel,format,status,planned_date,published_url,keywords,body,notes,created_at,updated_at";

function safeDate(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value !== "string" || !DAY.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

function validContent(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title || title.length > 140) return null;
  if (!CHANNELS.includes(value.channel) || !FORMATS.includes(value.format) || !STATUSES.includes(value.status)) return null;
  const planned_date = safeDate(value.planned_date);
  if (planned_date === undefined) return null;
  const getText = (key: string, limit: number) => {
    const field = value[key] === null || value[key] === undefined ? "" : value[key];
    return typeof field === "string" && field.length <= limit ? field.trim() : null;
  };
  const body = getText("body", 50000);
  const notes = getText("notes", 5000);
  const keywords = getText("keywords", 1000);
  const published_url = getText("published_url", 2000);
  if ([body, notes, keywords, published_url].some(field => field === null)) return null;
  if (published_url) {
    try {
      const url = new URL(published_url);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    } catch { return null; }
  }
  return { title, channel: value.channel, format: value.format, status: value.status,
    planned_date, published_url, keywords, body, notes };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    if (!checkAdminPassword(payload?.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }
    const supabase = getSupabaseAdmin();
    if (payload.action === "list") {
      const { data, error } = await supabase.from("content_posts").select(FIELDS)
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return NextResponse.json({ posts: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (payload.action === "create") {
      const entry = validContent(payload.post);
      if (!entry) return NextResponse.json({ message: "제목, 채널, 내용과 날짜를 확인해 주세요." }, { status: 400 });
      const { data, error } = await supabase.from("content_posts").insert(entry).select(FIELDS).single();
      if (error) throw error;
      return NextResponse.json({ post: data });
    }
    if (payload.action === "update") {
      if (typeof payload.id !== "string" || !UUID.test(payload.id)) {
        return NextResponse.json({ message: "콘텐츠 번호를 확인해 주세요." }, { status: 400 });
      }
      if (typeof payload.updated_at !== "string" || Number.isNaN(Date.parse(payload.updated_at))) {
        return NextResponse.json({ message: "화면을 새로고침하고 다시 시도해 주세요." }, { status: 400 });
      }
      const entry = validContent(payload.post);
      if (!entry) return NextResponse.json({ message: "입력 내용을 확인해 주세요." }, { status: 400 });
      const { data, error } = await supabase.from("content_posts")
        .update({ ...entry, updated_at: new Date().toISOString() })
        .eq("id", payload.id).eq("updated_at", payload.updated_at).select(FIELDS).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ message: "다른 화면에서 변경되었습니다. 목록을 다시 불러와 주세요." }, { status: 409 });
      return NextResponse.json({ post: data });
    }
    if (payload.action === "delete") {
      if (typeof payload.id !== "string" || !UUID.test(payload.id) ||
          typeof payload.updated_at !== "string" || Number.isNaN(Date.parse(payload.updated_at))) {
        return NextResponse.json({ message: "삭제할 콘텐츠를 확인해 주세요." }, { status: 400 });
      }
      const { data, error } = await supabase.from("content_posts").delete()
        .eq("id", payload.id).eq("updated_at", payload.updated_at).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ message: "다른 화면에서 수정되었습니다. 다시 불러와 주세요." }, { status: 409 });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ message: "요청을 확인해 주세요." }, { status: 400 });
  } catch {
    return NextResponse.json({ message: "콘텐츠 저장소에 연결하지 못했습니다. 데이터베이스 적용 상태를 확인해 주세요." }, { status: 500 });
  }
}
