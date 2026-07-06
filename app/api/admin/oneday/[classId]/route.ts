import { NextResponse } from "next/server";
import { checkAdminPassword } from "../../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

function toIsoFromLocal(value: string) {
  if (!value) return "";
  if (value.includes("T") && !value.endsWith("Z") && !value.includes("+")) {
    return new Date(`${value}:00+09:00`).toISOString();
  }
  return new Date(value).toISOString();
}

function parseNonNegativeNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  if (Number.isNaN(numberValue) || numberValue < 0) return fallback;
  return numberValue;
}

export async function PATCH(request: Request, context: { params: Promise<{ classId: string }> }) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const { classId } = await context.params;
    if (!classId) {
      return NextResponse.json({ message: "수정할 원데이 클래스 정보가 없습니다." }, { status: 400 });
    }

    const title = String(body.title || "").trim();
    const curriculum = String(body.curriculum || body.description || "").trim();
    const startAtRaw = String(body.start_at || "").trim();
    const endAtRaw = String(body.end_at || "").trim();
    const capacity = Math.max(1, Math.floor(parseNonNegativeNumber(body.capacity, 5)));
    const regularPrice = parseNonNegativeNumber(body.regular_price, 0);
    const normalPrice = parseNonNegativeNumber(body.normal_price, 0);
    const isOpen = typeof body.is_open === "boolean" ? body.is_open : true;

    if (!title || !startAtRaw || !endAtRaw) {
      return NextResponse.json({ message: "제목, 수업 시작 일정, 수업 종료 일정을 입력해 주세요." }, { status: 400 });
    }

    const start_at = toIsoFromLocal(startAtRaw);
    const end_at = toIsoFromLocal(endAtRaw);

    if (Number.isNaN(new Date(start_at).getTime()) || Number.isNaN(new Date(end_at).getTime())) {
      return NextResponse.json({ message: "수업 일정을 올바르게 입력해 주세요." }, { status: 400 });
    }
    if (new Date(end_at).getTime() <= new Date(start_at).getTime()) {
      return NextResponse.json({ message: "수업 종료 일정은 시작 일정 이후여야 합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: existingBookings, error: bookingError } = await supabase
      .from("oneday_bookings")
      .select("id, status, people_count")
      .eq("class_id", classId);
    if (bookingError) throw bookingError;

    const activePeopleCount = (existingBookings || [])
      .filter((booking) => !["cancelled", "취소", "취소완료"].includes(String(booking.status || "")))
      .reduce((sum, booking) => sum + Number(booking.people_count || 1), 0);

    if (capacity < activePeopleCount) {
      return NextResponse.json(
        { message: `현재 신청 인원 ${activePeopleCount}명보다 정원을 작게 수정할 수 없습니다.` },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("oneday_classes")
      .update({
        title,
        start_at,
        end_at,
        capacity,
        regular_price: regularPrice,
        normal_price: normalPrice,
        description: curriculum,
        is_open: isOpen,
      })
      .eq("id", classId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ classId: string }> }) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const { classId } = await context.params;
    if (!classId) {
      return NextResponse.json({ message: "삭제할 원데이 클래스 정보가 없습니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("oneday_classes")
      .update({ is_open: false })
      .eq("id", classId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : "오류가 발생했습니다.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
