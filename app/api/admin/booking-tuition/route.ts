import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { validTuitionAmount } from "../../../../lib/bookingTuition";

const columns = "booking_id,amount_krw,confirmed_at,memo,updated_at";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }
    if (typeof body.booking_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.booking_id)
      || !["load", "save"].includes(body.action)) {
      return NextResponse.json({ message: "예약과 요청을 확인해 주세요." }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const { data: current, error } = await supabase.from("booking_tuition")
      .select(columns).eq("booking_id", body.booking_id).maybeSingle();
    if (error) throw error;
    if (!current) return NextResponse.json({ message: "수강료 기록이 없습니다. 저장 구조 적용 여부를 확인해 주세요." }, { status: 404 });
    if (body.action === "load") return NextResponse.json({ tuition: current });
    if (!validTuitionAmount(body.amount_krw) || typeof body.confirmed !== "boolean"
      || (body.confirmed && body.amount_krw === null)
      || typeof body.memo !== "string" || body.memo.length > 1000
      || typeof body.updated_at !== "string") {
      return NextResponse.json({ message: "수강료는 0원 이상의 정수로 입력해 주세요. 입금 확인 시 금액이 필요하며 메모는 1,000자까지 가능합니다." }, { status: 400 });
    }
    const { data, error: saveError } = await supabase.from("booking_tuition").update({
      amount_krw: body.amount_krw,
      confirmed_at: body.confirmed ? (current.confirmed_at || new Date().toISOString()) : null,
      memo: body.memo.trim(),
      updated_at: new Date().toISOString(),
    }).eq("booking_id", body.booking_id).eq("updated_at", body.updated_at).select(columns).maybeSingle();
    if (saveError) throw saveError;
    if (!data) return NextResponse.json({ message: "다른 화면에서 수정되었습니다. 다시 불러온 뒤 저장해 주세요." }, { status: 409 });
    return NextResponse.json({ tuition: data });
  } catch {
    return NextResponse.json({ message: "수강료 기록을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
