import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const send = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const dayKey = (v: string | Date) => new Date(v).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const startUtc = (date: string) => new Date(date + "T00:00:00+09:00").toISOString();
const nextDate = (date: string) => new Date(new Date(startUtc(date)).getTime() + 86400000).toISOString();
const sum = (rows: { amount_krw?: number | null }[]) => rows.reduce((a, b) => a + Number(b.amount_krw || 0), 0);

type Json = Record<string, unknown>;
const tableNames: Record<string, string> = { content: "workspace_contents", lesson: "workspace_manual_lessons", sale: "workspace_sales", note: "workspace_notes" };
const fields: Record<string, string[]> = {
 content: ["channel","kind","title","body","keywords","status","planned_on","published_on","published_url","memo"],
 lesson: ["title","start_at","end_at","memo"],
 sale: ["payment_on","amount_krw","category","memo"],
 note: ["title","body"],
};
function safeText(v: unknown, max = 4000) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function validDate(v: unknown) { return typeof v === "string" && DATE.test(v) && !Number.isNaN(new Date(v + "T00:00:00Z").getTime()) && new Date(v + "T00:00:00Z").toISOString().slice(0,10) === v; }
function normalize(type: string, data: Json) {
 const out: Json = {};
 for (const key of fields[type]) out[key] = data[key];
 if (type === "content") {
  out.title = safeText(data.title, 200); out.body = safeText(data.body, 30000);
  out.keywords = safeText(data.keywords, 2000); out.memo = safeText(data.memo, 4000);
  out.kind = safeText(data.kind, 80) || "일반 게시물";
  out.published_url = safeText(data.published_url, 2000);
  if (!["blog","myplace","instagram","brunch"].includes(String(out.channel))) throw new Error("콘텐츠 채널을 확인해 주세요.");
  if (!["아이디어","초안","검토","발행 예정","발행 완료"].includes(String(out.status))) throw new Error("발행 상태를 확인해 주세요.");
  for(const key of ["planned_on","published_on"]) {
    if (!data[key]) out[key] = null;
    else if (!validDate(data[key])) throw new Error("날짜를 확인해 주세요.");
  }
  if (out.published_url && !/^https:\/\/\S+$/i.test(String(out.published_url))) throw new Error("게시물 URL은 https로 시작해 주세요.");
 } else if (type === "lesson") {
  out.title = safeText(data.title, 160); out.memo = safeText(data.memo, 4000);
  const from = new Date(String(out.start_at)), to = new Date(String(out.end_at));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw new Error("수업 시작·종료 시간을 확인해 주세요.");
  out.start_at = from.toISOString(); out.end_at = to.toISOString();
 } else if (type === "sale") {
  if (!validDate(out.payment_on)) throw new Error("입금 날짜를 확인해 주세요.");
  const n = Number(data.amount_krw);
  if (!Number.isSafeInteger(n) || n < 0 || n > 2147483647) throw new Error("입금 금액을 확인해 주세요.");
  out.amount_krw = n; out.category = safeText(data.category, 80) || "기타 수입"; out.memo = safeText(data.memo, 1000);
 } else if (type === "note") { out.title = safeText(data.title, 160); out.body = safeText(data.body, 10000); }
 if (!out.title && type !== "sale") throw new Error("제목을 입력해 주세요.");
 return out;
}
async function load() {
 const db = getSupabaseAdmin();
 const today = dayKey(new Date()), month = today.slice(0, 7);
 const monthStart = month + "-01";
 const nextMonthStart = new Date(new Date(monthStart + "T00:00:00Z").setUTCMonth(Number(month.slice(5,7)))).toISOString().slice(0,10);
 const [bookings, tuition, registrations, oneday, contents, lessons, sales, notes] = await Promise.all([
  db.from("regular_bookings").select("id,start_at,end_at,status").gte("start_at",startUtc(today)).lt("start_at",nextDate(today)).order("start_at"),
  db.from("booking_tuition").select("amount_krw,confirmed_at").gte("confirmed_at",startUtc(monthStart)).lt("confirmed_at",startUtc(nextMonthStart)),
  db.from("student_registration_payments").select("amount_krw,payment_date").gte("payment_date",monthStart).lt("payment_date",nextMonthStart),
  db.from("oneday_bookings").select("paid_amount,payment_confirmed_at,status").gte("payment_confirmed_at",startUtc(monthStart)).lt("payment_confirmed_at",startUtc(nextMonthStart)),
  db.from("workspace_contents").select("*").order("created_at",{ascending:false}).limit(500),
  db.from("workspace_manual_lessons").select("*").order("start_at",{ascending:false}).limit(500),
  db.from("workspace_sales").select("*").gte("payment_on",monthStart).lt("payment_on",nextMonthStart).order("payment_on",{ascending:false}).limit(1000),
  db.from("workspace_notes").select("*").order("created_at",{ascending:false}).limit(200),
 ]);
 for (const query of [bookings, tuition, registrations, oneday, contents, lessons, sales, notes]) if(query.error) throw query.error;
 const incoming: { amount_krw: number; day: string; source: string }[] = [];
 for(const x of tuition.data || []) if(x.confirmed_at && Number.isFinite(x.amount_krw)) incoming.push({ amount_krw: Number(x.amount_krw), day: dayKey(x.confirmed_at), source: "수업별 입금 확인" });
 for(const x of registrations.data || []) incoming.push({ amount_krw: Number(x.amount_krw || 0), day: x.payment_date, source: "수강권 등록" });
 for(const x of oneday.data || []) if(x.status !== "cancelled" && x.status !== "late_cancelled" && x.payment_confirmed_at) incoming.push({ amount_krw: Number(x.paid_amount || 0), day: dayKey(x.payment_confirmed_at), source: "원데이 입금" });
 for(const x of sales.data || []) incoming.push({ amount_krw: Number(x.amount_krw || 0), day: x.payment_on, source: "직접 등록 매출" });
 const monthRevenue = sum(incoming), todayRevenue = sum(incoming.filter(x=>x.day===today));
 return send({
  today, month, metrics: { todayRevenue, monthRevenue, revenueBySource: ["수업별 입금 확인","수강권 등록","원데이 입금","직접 등록 매출"].map(source => ({ source, amount: sum(incoming.filter(x=>x.source===source)) })) },
  regular: (bookings.data || []).filter(x => !["cancelled","late_cancelled"].includes(x.status)),
  contents: contents.data || [], lessons: lessons.data || [], sales: sales.data || [], notes: notes.data || [],
  accountingNotice: "입금 기록 기준 잠정 매출입니다. 수강권 등록과 수업별 입금을 중복 기록했는지, 취소·환불이 반영되었는지 확인해 주세요.",
 });
}
export async function POST(req: Request) {
 try {
  const body = await req.json() as Json;
  if(!checkAdminPassword(body.password)) return send({ message: getAdminPasswordErrorMessage() },401);
  if(body.action === "load") return await load();
  const action = String(body.action || ""), type = String(body.type || ""), table = tableNames[type];
  if (!table || !["save","delete"].includes(action)) return send({message:"요청을 확인해 주세요."},400);
  const db=getSupabaseAdmin(), id = body.id && UUID.test(String(body.id)) ? String(body.id) : null;
  if (body.id && !id) return send({message:"항목 ID를 확인해 주세요."},400);
  if(action === "delete") {
   if(!id) return send({message:"삭제할 항목이 없습니다."},400);
   const result = await db.from(table).delete().eq("id",id);
   if(result.error) throw result.error;
   return send({ok:true});
  }
  const record=normalize(type,(body.data && typeof body.data==="object" ? body.data : {}) as Json);
  const result = id
   ? await db.from(table).update({...record,...(type==="content"?{updated_at:new Date().toISOString()}: {})}).eq("id",id).select("*").single()
   : await db.from(table).insert(record).select("*").single();
  if(result.error) throw result.error;
  return send({ok:true,record:result.data});
 } catch(e) {
  return send({message: e instanceof Error ? e.message : "요청 처리 중 오류가 발생했습니다."},500);
 }
}
