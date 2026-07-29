import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import {
  isAtLeastThreeHoursBefore,
  isLessonWithinOperatingHours,
  lessonEndIso,
  normalizeLessonDurationMinutes,
  conflictsWithOneDayBlocks,
  conflictsWithRegularBookings,
  regularLessonRule,
  overlapsAnyTimeBlock,
  parseAutoAdjustmentSlotId,
  isAutoAdjustmentCandidate,
} from "../../../lib/businessRules";
import {
  calculatePassExpirationDateKey,
  canBookWithRegularPassPolicy,
  dateKeyInKst,
  shouldApplyRegularPassPolicy,
} from "../../../lib/passPolicy";
import { getErrorMessage, isMissingPassColumnError } from "../../../lib/supabaseCompat";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const APP_VERSION = "23";

type SlotForBooking = {
  id: string;
  start_at: string;
  end_at: string | null;
  is_open: boolean;
};

function parseV23AutoAdjustmentSlotId(slotId: string) {
  const existingParsed = parseAutoAdjustmentSlotId(slotId);
  if (existingParsed) return existingParsed;

  if (slotId.startsWith("auto:")) {
    try {
      const decoded = decodeURIComponent(slotId.replace(/^auto:/, ""));
      if (!Number.isNaN(new Date(decoded).getTime())) return decoded;
    } catch {
      return null;
    }
  }

  if (slotId.startsWith("auto-adjustment:")) {
    try {
      const decoded = decodeURIComponent(slotId.replace(/^auto-adjustment:/, ""));
      if (!Number.isNaN(new Date(decoded).getTime())) return decoded;
    } catch {
      return null;
    }
  }

  return null;
}

function isV23AutoCandidate(startAt: string, lessonMinutes: number) {
  if (!isAtLeastThreeHoursBefore(startAt)) return false;
  if (!isLessonWithinOperatingHours(startAt, lessonMinutes)) return false;
  return true;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const studentId = String(body.studentId || "");
    const slotId = String(body.slotId || "");

    if (!studentId || !slotId) {
      return NextResponse.json(
        { message: "예약 정보가 부족합니다.", version: APP_VERSION },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const supabase = getSupabaseAdmin();

    let studentResult = await supabase
      .from("students")
      .select(
        "id, lesson_credits, lesson_duration_minutes, pass_registered_at, pass_first_lesson_at, pass_expires_at, pass_extension_until"
      )
      .eq("id", studentId)
      .eq("is_active", true)
      .single();

    if (studentResult.error && isMissingPassColumnError(studentResult.error)) {
      studentResult = await supabase
        .from("students")
        .select("id, lesson_credits, lesson_duration_minutes")
        .eq("id", studentId)
        .eq("is_active", true)
        .single();
    }

    if (studentResult.error) throw studentResult.error;

    const student = studentResult.data;
    const currentCredits = Number(student.lesson_credits || 0);

    if (currentCredits <= 0) {
      return NextResponse.json(
        { message: "잔여 수강권이 없어 예약할 수 없습니다. 관리자에게 문의해 주세요.", version: APP_VERSION },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const requestedLessonMinutes = normalizeLessonDurationMinutes(
      student.lesson_duration_minutes
    );

    const autoStartAt = parseV23AutoAdjustmentSlotId(slotId);
    let slot: SlotForBooking;

    if (autoStartAt) {
      const acceptedByOldRule = isAutoAdjustmentCandidate(autoStartAt, requestedLessonMinutes);
      const acceptedByV23Rule = isV23AutoCandidate(autoStartAt, requestedLessonMinutes);

      if (!acceptedByOldRule && !acceptedByV23Rule) {
        return NextResponse.json(
          { message: "해당 조율 시간은 예약할 수 없습니다. 다른 시간을 선택해 주세요.", version: APP_VERSION },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }

      slot = {
        id: slotId,
        start_at: autoStartAt,
        end_at: null,
        is_open: true,
      };
    } else {
      const { data: normalSlot, error: slotError } = await supabase
        .from("available_slots")
        .select("id, start_at, end_at, is_open")
        .eq("id", slotId)
        .eq("is_open", true)
        .single();

      if (slotError) throw slotError;

      if (!normalSlot) {
        return NextResponse.json(
          { message: "예약 가능한 수업 시간이 아닙니다.", version: APP_VERSION },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      }

      slot = normalSlot;
    }

    if (!isAtLeastThreeHoursBefore(slot.start_at)) {
      return NextResponse.json(
        { message: "수업 시작 3시간 전까지만 예약할 수 있습니다.", version: APP_VERSION },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const passPolicyCheck = canBookWithRegularPassPolicy(student, slot.start_at);

    if (!passPolicyCheck.ok) {
      return NextResponse.json(
        {
          message: `수강권 사용기한이 만료되어 예약할 수 없습니다. 사용기한: ${
            passPolicyCheck.status.expiresAt || "-"
          }. 문장학교로 문의해 주세요.`,
          version: APP_VERSION,
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const rule = regularLessonRule(slot.start_at, requestedLessonMinutes);
    const candidateEndAt = lessonEndIso(slot.start_at, requestedLessonMinutes);

    if (!isLessonWithinOperatingHours(slot.start_at, requestedLessonMinutes)) {
      return NextResponse.json(
        { message: "해당 시간은 예약할 수 없습니다. 다른 시간을 선택해 주세요.", version: APP_VERSION },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { data: onedayClasses, error: onedayError } = await supabase
      .from("oneday_classes")
      .select("id, start_at, end_at")
      .eq("is_open", true)
      .gte("end_at", slot.start_at);

    if (onedayError) throw onedayError;

    if (conflictsWithOneDayBlocks(slot.start_at, candidateEndAt, onedayClasses || [])) {
      return NextResponse.json(
        { message: "해당 시간에는 원데이 클래스가 있어 예약할 수 없습니다. 다른 시간을 선택해 주세요.", version: APP_VERSION },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { data: blockedTimes, error: blockedError } = await supabase
      .from("blocked_times")
      .select("id, start_at, end_at")
      .gte("end_at", slot.start_at);

    if (blockedError) throw blockedError;

    if (overlapsAnyTimeBlock(slot.start_at, candidateEndAt, blockedTimes || [])) {
      return NextResponse.json(
        { message: "해당 시간에는 외부 예약 또는 체험수업 일정이 있어 예약할 수 없습니다. 다른 시간을 선택해 주세요.", version: APP_VERSION },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { data: existingBookings, error: existingError } = await supabase
      .from("regular_bookings")
      .select("id, slot_id, start_at, end_at, status")
      .in("status", ["booked", "change_request", "cancel_request"]);

    if (existingError) throw existingError;

    const alreadyTaken = (existingBookings || []).some((booking) => {
      return (
        booking.slot_id === slot.id ||
        conflictsWithRegularBookings(slot.start_at, candidateEndAt, [
          {
            start_at: booking.start_at,
            end_at: booking.end_at,
          },
        ])
      );
    });

    if (alreadyTaken) {
      return NextResponse.json(
        { message: "이미 다른 수강생이 예약한 시간입니다.", version: APP_VERSION },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (autoStartAt) {
      const { data: savedSlot, error: saveSlotError } = await supabase
        .from("available_slots")
        .upsert(
          {
            start_at: slot.start_at,
            end_at: candidateEndAt,
            is_open: true,
          },
          { onConflict: "start_at" }
        )
        .select("id, start_at, end_at, is_open")
        .single();

      if (saveSlotError) throw saveSlotError;

      if (!savedSlot) {
        return NextResponse.json(
          { message: "자동 조율 시간을 저장하지 못했습니다.", version: APP_VERSION },
          { status: 500, headers: { "Cache-Control": "no-store" } },
        );
      }

      slot = savedSlot;
    }

    const { error: bookingError } = await supabase.from("regular_bookings").insert({
      student_id: studentId,
      slot_id: slot.id,
      start_at: slot.start_at,
      end_at: candidateEndAt,
      status: "booked",
      memo: `수강생 직접 예약 / ${rule.policyLabel} / ${
        autoStartAt ? "자동 조율 슬롯 / " : ""
      }${rule.label} / 수강권 1회 차감 / v${APP_VERSION}`,
    });

    if (bookingError) {
      if (bookingError.message.includes("duplicate")) {
        return NextResponse.json(
          { message: "이미 다른 수강생이 예약한 시간입니다.", version: APP_VERSION },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }

      throw bookingError;
    }

    const studentUpdate: Record<string, unknown> = {
      lesson_credits: currentCredits - 1,
    };

    if (shouldApplyRegularPassPolicy(student) && !student.pass_first_lesson_at) {
      const firstLessonDateKey = dateKeyInKst(new Date(slot.start_at));
      studentUpdate.pass_first_lesson_at = firstLessonDateKey;
      studentUpdate.pass_expires_at = calculatePassExpirationDateKey(firstLessonDateKey);
    }

    let { error: creditError } = await supabase
      .from("students")
      .update(studentUpdate)
      .eq("id", studentId);

    if (creditError && isMissingPassColumnError(creditError)) {
      const fallbackResult = await supabase
        .from("students")
        .update({ lesson_credits: currentCredits - 1 })
        .eq("id", studentId);

      creditError = fallbackResult.error;
    }

    if (creditError) throw creditError;

    return NextResponse.json(
      {
        ok: true,
        version: APP_VERSION,
        lesson_credits: currentCredits - 1,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { message: getErrorMessage(error), version: APP_VERSION },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
