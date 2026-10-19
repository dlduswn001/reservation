import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { validTuitionAmount } from "../../../../lib/bookingTuition";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = "block_id,amount_krw,confirmed_at,memo,updated_at";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body?.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }
    if (typeof body?.block_id !== "string" || !UUID.test(body.block_id)
      || !["save", "load"].includes(body.action)) {
      return NextResponse.json({ message: "관리자 일정과 요청을 확인해 주세요." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: block, error: blockError } = await supabase.from("blocked_times")
      .select("id").eq("id", body.block_id).maybeSingle();
    if (blockError) throw blockError;
    if (!block) return NextResponse.json({ message: "해당 일정이 없습니다." }, { status: 404 });

    const { data: existing, error: lookupError } = await supabase.from("blocked_time_tuition")
      .select(FIELDS).eq("block_id", body.block_id).maybeSingle();
    if (lookupError) throw lookupError;
    if (body.action === "load") {
      return NextResponse.json({ tuition: existing || null }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (!validTuitionAmount(body.amount_krw)
      || typeof body.confirmed !== "boolean"
      || (body.confirmed && body.amount_krw === null)
      || typeof body.memo !== "string" || body.memo.length > 1000
      || (body.updated_at !== null && typeof body.updated_at !== "string")) {
      return NextResponse.json({ message: "수강료는 0원 이상으로 입력하고 입금 상태를 확인해 주세요." }, { status: 400 });
    }
    const update = {
      amount_krw: body.amount_krw,
      confirmed_at: body.confirmed ? (existing?.confirmed_at || new Date().toISOString()) : null,
      memo: body.memo.trim(),
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      if (body.updated_at !== existing.updated_at) {
        return NextResponse.json({ message: "다른 화면에서 변경됐습니다. 다시 불러와 주세요." }, { status: 409 });
      }
      const { data, error } = await supabase.from("blocked_time_tuition").update(update)
        .eq("block_id", body.block_id).eq("updated_at", existing.updated_at)
        .select(FIELDS).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ message: "수정 내역이 달라졌습니다. 다시 불러와 주세요." }, { status: 409 });
      return NextResponse.json({ tuition: data }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (body.updated_at !== null) {
      return NextResponse.json({ message: "저장 상태가 변경됐습니다. 다시 불러와 주세요." }, { status: 409 });
    }
    const { data, error } = await supabase.from("blocked_time_tuition").insert({
      block_id: body.block_id, ...update,
    }).select(FIELDS).single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ message: "다른 화면에서 등록됐습니다. 다시 불러와 주세요." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ tuition: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ message: "직접 입력한 수강료를 저장하지 못했습니다." }, { status: 500 });
  }
}
