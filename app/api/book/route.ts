import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import {
  isAtLeastThreeHoursBefore,
  isLessonWithinOperatingHours,
  lessonEndIso,
  normalizeLessonDurationMinutes,
  EXTENDED_LESSON_MINUTES,
  getReservationLessonMinutes,
  getReservationCreditCost,
  isLifestyleLessonSlot,
  isOfficialClassStartTime,
  reservationKindLabel,
  normalizeLifestyleClassName,
  conflictsWithOneDayBlocks,
  conflictsWithRegularBookings,
  regularLessonRule,
  overlapsAnyTimeBlock,
  WEEKDAY_VISIBLE_TIMETABLE_START_TIMES,
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

function isSundayKst(value: string) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(new Date(value));

  return weekday === "Sun";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const studentId = String(body.studentId || "");
    const slotId = String(body.slotId || "");
    const lifestyleClassName = normalizeLifestyleClassName(body.lifestyleClassName || body.lessonType);
    if (!studentId || !slotId) {
      return NextResponse.json({ message: "예약 정보가 부족합니다." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    let studentResult = await supabase
      .from("students")
      .select("id, lesson_credits, lesson_duration_minutes, pass_registered_at, pass_first_lesson_at, pass_expires_at, pass_extension_until")
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
      return NextResponse.json({ message: "잔여 수강권이 없어 예약할 수 없습니다. 관리자에게 문의해 주세요." }, { status: 400 });
    }

    const requestedLessonMinutes = normalizeLessonDurationMinutes(student.lesson_duration_minutes);
    if (requestedLessonMinutes === EXTENDED_LESSON_MINUTES) {
      return NextResponse.json({ message: "120분 수업은 문장학교 카카오톡 채널로 직접 일정을 조율해 주세요." }, { status: 400 });
    }

    const autoStartAt = parseAutoAdjustmentSlotId(slotId);
    let slot: { id: string; start_at: string; end_at: string | null; is_open: boolean };

    if (autoStartAt) {
      // 관리자가 열지 않은 월·화요일은 임의의 자동 조율 슬롯으로도 예약할 수 없습니다.
      const autoWeekday = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        weekday: "short",
      }).format(new Date(autoStartAt));
      if (["Mon", "Tue"].includes(autoWeekday)) {
        return NextResponse.json({ message: "월·화요일은 관리자가 연 시간만 예약할 수 있습니다." }, { status: 400 });
      }
      if (!isAutoAdjustmentCandidate(autoStartAt, requestedLessonMinutes)) {
        return NextResponse.json({ message: "해당 조율 시간은 예약할 수 없습니다. 다른 시간을 선택해 주세요." }, { status: 400 });
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
      slot = normalSlot;
    }

    // 월·화요일에는 관리자가 해당 날짜를 명시적으로 개방한 5개 시간만 실제 예약할 수 있습니다.
    // 10월 19/20/26/27일은 이전에 수동 개방한 보호 일정이므로 기존 예약 로직 유지.
    const weekdayKst = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul", weekday: "short",
    }).format(new Date(slot.start_at));
    if (["Mon", "Tue"].includes(weekdayKst)) {
      const dateKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date(slot.start_at));
      const protectedDates = new Set(["2026-10-19", "2026-10-20", "2026-10-26", "2026-10-27"]);
      if (!protectedDates.has(dateKey)) {
        const timeKey = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
        }).format(new Date(slot.start_at));
        if (!WEEKDAY_VISIBLE_TIMETABLE_START_TIMES.includes(timeKey)) {
          return NextResponse.json({ message: "월·화요일은 관리자 지정 시간만 예약할 수 있습니다." }, { status: 400 });
        }
        const { data: manualOpening, error: manualError } = await supabase
          .from("regular_weekday_open_dates")
          .select("date_key")
          .eq("date_key", dateKey)
          .maybeSingle();
        if (manualError) throw manualError;
        if (!manualOpening) {
          return NextResponse.json({ message: "월·화요일은 정규 휴무일입니다. 관리자가 연 날짜에만 예약할 수 있습니다." }, { status: 400 });
        }
      }
    }

    if (!isAtLeastThreeHoursBefore(slot.start_at)) {
      return NextResponse.json({ message: "수업 시작 3시간 전까지만 예약할 수 있습니다." }, { status: 400 });
    }

    const passPolicyCheck = canBookWithRegularPassPolicy(student, slot.start_at);
    if (!passPolicyCheck.ok) {
      return NextResponse.json({
        message: `수강권 사용기한이 만료되어 예약할 수 없습니다. 사용기한: ${passPolicyCheck.status.expiresAt || "-"}. 문장학교로 문의해 주세요.`,
      }, { status: 400 });
    }

    // A stale app or hand-crafted API request must never book old 30-minute
    // weekend times even if a legacy database slot happens to be open.
    if (["Sat", "Sun"].includes(weekdayKst) && !isOfficialClassStartTime(slot.start_at)) {
      return NextResponse.json({
        message:"주말에는 정규 10:00·13:00·14:40, 생활 12:00·16:30에만 예약할 수 있습니다.",
      }, {status:400});
    }

    // There are no shared regular/lifestyle class start times.
    // Reject stale clients attempting a regular class at the lifestyle-only weekend noon.
    const requestedClassChoice = String(body.lifestyleClassName || body.lessonType || "");
    const isLifestyle = isLifestyleLessonSlot(slot.start_at);
    if (isLifestyle && !["1:1 서평생활", "1:1 필사생활"].includes(requestedClassChoice)) {
      return NextResponse.json({message:"이 시간은 서평생활·필사생활 전용입니다. 수업 종류를 선택해 주세요."},{status:400});
    }
    if (!isLifestyle && requestedClassChoice && requestedClassChoice !== "정규수업") {
      return NextResponse.json({message:"이 시간은 정규수업 전용입니다. 다른 시간을 선택해 주세요."},{status:400});
    }
    const slotLessonMinutes = getReservationLessonMinutes(slot.start_at, requestedLessonMinutes);
    const creditCost = getReservationCreditCost(slot.start_at, requestedLessonMinutes);
    const rule = regularLessonRule(slot.start_at, slotLessonMinutes);
    const candidateEndAt = lessonEndIso(slot.start_at, slotLessonMinutes);

    if (currentCredits < creditCost) {
      return NextResponse.json({ message: `잔여 수강권이 부족합니다. 이 수업은 수강권 ${creditCost}회가 필요합니다.` }, { status: 400 });
    }

    // 월·화요일도 수요일의 정규 시간표를 적용합니다.
    if (!isLessonWithinOperatingHours(slot.start_at, slotLessonMinutes)) {
      return NextResponse.json({ message: "해당 시간은 예약할 수 없습니다. 다른 시간을 선택해 주세요." }, { status: 400 });
    }

    const { data: onedayClasses, error: onedayError } = await supabase
      .from("oneday_classes")
      .select("id, start_at, end_at")
      .eq("is_open", true)
      .gte("end_at", slot.start_at);
    if (onedayError) throw onedayError;

    if (conflictsWithOneDayBlocks(slot.start_at, candidateEndAt, onedayClasses || [])) {
      return NextResponse.json({ message: "해당 시간에는 원데이 클래스가 있어 예약할 수 없습니다. 다른 시간을 선택해 주세요." }, { status: 400 });
    }

    const { data: blockedTimes, error: blockedError } = await supabase
      .from("blocked_times")
      .select("id, start_at, end_at")
      .gte("end_at", slot.start_at);
    if (blockedError) throw blockedError;

    if (overlapsAnyTimeBlock(slot.start_at, candidateEndAt, blockedTimes || [])) {
      return NextResponse.json({ message: "해당 시간에는 외부 예약 또는 체험수업 일정이 있어 예약할 수 없습니다. 다른 시간을 선택해 주세요." }, { status: 400 });
    }

    const { data: existingBookings, error: existingError } = await supabase
      .from("regular_bookings")
      .select("id, slot_id, start_at, end_at, status")
      .in("status", ["booked", "change_request", "cancel_request"]);
    if (existingError) throw existingError;

    const alreadyTaken = (existingBookings || []).some((booking) => (
      booking.slot_id === slot.id || conflictsWithRegularBookings(slot.start_at, candidateEndAt, [{ start_at: booking.start_at, end_at: booking.end_at }])
    ));
    if (alreadyTaken) {
      return NextResponse.json({ message: "이미 다른 수강생이 예약한 시간입니다." }, { status: 409 });
    }

    if (autoStartAt) {
      const { data: savedSlot, error: saveSlotError } = await supabase
        .from("available_slots")
        .upsert({
          start_at: slot.start_at,
          end_at: candidateEndAt,
          is_open: true,
        }, { onConflict: "start_at" })
        .select("id, start_at, end_at, is_open")
        .single();
      if (saveSlotError) throw saveSlotError;
      slot = savedSlot;
    }

    const { error } = await supabase.from("regular_bookings").insert({
      student_id: studentId,
      slot_id: slot.id,
      start_at: slot.start_at,
      end_at: candidateEndAt,
      status: "booked",
      memo: `수강생 직접 예약 / ${(isLifestyle ? lifestyleClassName : "정규수업")} / ${rule.policyLabel} / ${autoStartAt ? "자동 조율 슬롯 / " : ""}${rule.label} / 수강권 ${creditCost}회 차감${isLifestyle ? ` / 선택: ${lifestyleClassName}` : ""}`,
    });
    if (error) {
      if (error.message.includes("duplicate")) {
        return NextResponse.json({ message: "이미 다른 수강생이 예약한 시간입니다." }, { status: 409 });
      }
      throw error;
    }

    const nextCredits = Math.max(0, Number((currentCredits - creditCost).toFixed(2)));
    const studentUpdate: Record<string, unknown> = { lesson_credits: nextCredits };
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
      const fallbackUpdate: Record<string, unknown> = { lesson_credits: nextCredits };
      const fallbackResult = await supabase
        .from("students")
        .update(fallbackUpdate)
        .eq("id", studentId);
      creditError = fallbackResult.error;
    }

    if (creditError) throw creditError;

    return NextResponse.json({ ok: true, lesson_credits: nextCredits, credit_cost: creditCost, class_name: isLifestyle ? lifestyleClassName : "정규수업" });
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error) }, { status: 500 });
  }
}
