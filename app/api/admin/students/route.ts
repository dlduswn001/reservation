import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { normalizeLessonDurationMinutes } from "../../../../lib/businessRules";
import {
  calculatePassExpirationDateKey,
  cleanDateKey,
} from "../../../../lib/passPolicy";
import { getErrorMessage, isMissingPassColumnError } from "../../../../lib/supabaseCompat";

function buildPassUpdate(body: Record<string, unknown>) {
  const passRegisteredAt = cleanDateKey(body.pass_registered_at);
  const passFirstLessonAt = cleanDateKey(body.pass_first_lesson_at);
  const passExtensionUntil = cleanDateKey(body.pass_extension_until);
  const passExtensionReason = String(body.pass_extension_reason || "").trim();
  const passExtensionUsed = Boolean(body.pass_extension_used || passExtensionUntil || passExtensionReason);
  const passExpiresAt = passFirstLessonAt ? calculatePassExpirationDateKey(passFirstLessonAt) : cleanDateKey(body.pass_expires_at);

  return {
    error: null as string | null,
    value: {
      pass_registered_at: passRegisteredAt,
      pass_first_lesson_at: passFirstLessonAt,
      pass_expires_at: passExpiresAt,
      pass_extension_used: passExtensionUsed,
      pass_extension_until: passExtensionUntil,
      pass_extension_reason: passExtensionReason || null,
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    const name = String(body.name || "").trim();
    const phoneNumber = String(body.phone_number || "").replace(/[^0-9]/g, "");
    const paidAmount = body.paid_amount_krw === undefined || body.paid_amount_krw === ""
      ? 0 : Number(body.paid_amount_krw);
    const phoneLast4 = String(body.phone_last4 || "").trim();
    const memo = String(body.memo || "").trim();
    const lessonCredits = Math.max(0, Number(body.lesson_credits || 0));
    const lessonDurationMinutes = normalizeLessonDurationMinutes(body.lesson_duration_minutes);
    const passUpdate = buildPassUpdate(body);

    if (passUpdate.error) {
      return NextResponse.json({ message: passUpdate.error }, { status: 400 });
    }
    if (!name || !/^[0-9]{4}$/.test(phoneLast4)) {
      return NextResponse.json({ message: "이름과 휴대폰 번호 끝 4자리를 입력해 주세요." }, { status: 400 });
    }
    if (phoneNumber && (!/^01[016789][0-9]{7,8}$/.test(phoneNumber) || !phoneNumber.endsWith(phoneLast4))) {
      return NextResponse.json({ message: "전체 연락처와 끝 4자리가 일치하는지 확인해 주세요." }, { status: 400 });
    }
    if (!Number.isSafeInteger(paidAmount) || paidAmount < 0 || !Number.isFinite(lessonCredits)) {
      return NextResponse.json({ message: "수강료와 수강권 횟수를 확인해 주세요." }, { status: 400 });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("munjang_admin_create_student", {
      p_name: name,
      p_phone_last4: phoneLast4,
      p_phone_number: phoneNumber || null,
      p_initial_credits: lessonCredits,
      p_duration: lessonDurationMinutes,
      p_registered_at: passUpdate.value.pass_registered_at,
      p_paid_amount: paidAmount,
    });
    if (error) {
      if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
        return NextResponse.json({ message: "이미 등록된 수강생입니다." }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, student_id: data });
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error) }, { status: 500 });
  }
}
