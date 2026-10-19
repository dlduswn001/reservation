import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";
import {
  addMinutesToIso,
  normalizeLessonDurationMinutes,
  conflictsWithRegularBookings,
  overlapsAnyTimeBlock,
} from "../../../../../lib/businessRules";
import {
  calculatePassExpirationDateKey,
  dateKeyInKst,
  shouldApplyRegularPassPolicy,
} from "../../../../../lib/passPolicy";
import { getErrorMessage, isMissingPassColumnError } from "../../../../../lib/supabaseCompat";

const ACTIVE_REGULAR_STATUSES = ["booked", "change_request", "cancel_request"];

function isLocalDateTime(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
}

function localDateTimeToUtcIso(value: string) {
  if (!isLocalDateTime(value)) return "";
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, 0, 0)).toISOString();
}

async function maybeFindSlotId(supabase: ReturnType<typeof getSupabaseAdmin>, startAt: string) {
  const { data } = await supabase
    .from("available_slots")
    .select("id")
    .eq("start_at", startAt)
    .maybeSingle();
  return data?.id || null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    const studentId = String(body.student_id || "").trim();
    const startAt = localDateTimeToUtcIso(String(body.start_at || ""));
    const lessonMinutes = normalizeLessonDurationMinutes(body.lesson_minutes || 120);
    const memo = String(body.memo || "").trim();
    const deductCredit = body.deduct_credit !== false;

    if (!studentId) {
      return NextResponse.json({ message: "수강생을 선택해 주세요." }, { status: 400 });
    }
    if (!startAt) {
      return NextResponse.json({ message: "수업 시작 시간을 입력해 주세요." }, { status: 400 });
    }

    const endAt = addMinutesToIso(startAt, lessonMinutes);
    const supabase = getSupabaseAdmin();

    let studentResult = await supabase
      .from("students")
      .select("id, name, lesson_credits, lesson_duration_minutes, pass_registered_at, pass_first_lesson_at, pass_expires_at, pass_extension_until")
      .eq("id", studentId)
      .maybeSingle();

    if (studentResult.error && isMissingPassColumnError(studentResult.error)) {
      studentResult = await supabase
        .from("students")
        .select("id, name, lesson_credits, lesson_duration_minutes")
        .eq("id", studentId)
        .maybeSingle();
    }

    if (studentResult.error) throw studentResult.error;
    if (!studentResult.data) {
      return NextResponse.json({ message: "수강생 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    const student = studentResult.data as any;
    const currentCredits = Number(student.lesson_credits || 0);
    if (deductCredit && currentCredits < 1) {
      return NextResponse.json({ message: "잔여 수강권이 부족합니다." }, { status: 400 });
    }

    const [regularBookings, blockedTimes, onedayClasses] = await Promise.all([
      supabase
        .from("regular_bookings")
        .select("id, start_at, end_at, status")
        .in("status", ACTIVE_REGULAR_STATUSES),
      supabase
        .from("blocked_times")
        .select("id, start_at, end_at"),
      supabase
        .from("oneday_classes")
        .select("id, start_at, end_at")
        .eq("is_open", true),
    ]);

    for (const result of [regularBookings, blockedTimes, onedayClasses]) {
      if (result.error) throw result.error;
    }

    if (conflictsWithRegularBookings(startAt, endAt, (regularBookings.data || []) as any[])) {
      return NextResponse.json({ message: "이미 겹치는 정규수업 예약이 있습니다." }, { status: 409 });
    }
    if (overlapsAnyTimeBlock(startAt, endAt, (blockedTimes.data || []) as any[])) {
      return NextResponse.json({ message: "외부 일정 또는 체험수업과 겹칩니다." }, { status: 409 });
    }
    if (overlapsAnyTimeBlock(startAt, endAt, (onedayClasses.data || []) as any[])) {
      return NextResponse.json({ message: "원데이 클래스와 겹칩니다." }, { status: 409 });
    }

    const slotId = await maybeFindSlotId(supabase, startAt);
    const bookingMemo = `관리자 직접 예약 / ${lessonMinutes}분 수업 / 수강권 ${deductCredit ? "1회 차감" : "차감 없음"}${memo ? " / " + memo : ""}`;

    const { error: insertError } = await supabase.from("regular_bookings").insert({
      student_id: studentId,
      slot_id: slotId,
      start_at: startAt,
      end_at: endAt,
      status: "booked",
      memo: bookingMemo,
    });

    if (insertError) throw insertError;

    if (deductCredit) {
      const update: Record<string, unknown> = {
        lesson_credits: Math.max(0, Number((currentCredits - 1).toFixed(2))),
      };
      if (shouldApplyRegularPassPolicy(student) && !student.pass_first_lesson_at) {
        const firstLessonDateKey = dateKeyInKst(new Date(startAt));
        update.pass_first_lesson_at = firstLessonDateKey;
        update.pass_expires_at = calculatePassExpirationDateKey(firstLessonDateKey);
      }

      let { error: updateError } = await supabase
        .from("students")
        .update(update)
        .eq("id", studentId);

      if (updateError && isMissingPassColumnError(updateError)) {
        const fallback = await supabase
          .from("students")
          .update({ lesson_credits: update.lesson_credits })
          .eq("id", studentId);
        updateError = fallback.error;
      }
      if (updateError) throw updateError;
    }

    return NextResponse.json({ ok: true, message: "정규수업을 관리자 예약으로 등록했습니다." });
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error) }, { status: 500 });
  }
}
