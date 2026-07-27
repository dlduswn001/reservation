import { NextResponse } from "next/server";
import { checkAdminPassword } from "../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { normalizeLessonDurationMinutes } from "../../../../lib/businessRules";
import {
  calculatePassExpirationDateKey,
  cleanDateKey,
  maxExtensionDateKey,
  PASS_POLICY_START_DATE_KEY,
} from "../../../../lib/passPolicy";

function buildPassUpdate(body: Record<string, unknown>) {
  const passRegisteredAt = cleanDateKey(body.pass_registered_at);
  const passFirstLessonAt = cleanDateKey(body.pass_first_lesson_at);
  const passExtensionUntil = cleanDateKey(body.pass_extension_until);
  const passExtensionReason = String(body.pass_extension_reason || "").trim();
  const passExtensionUsed = Boolean(body.pass_extension_used || passExtensionUntil || passExtensionReason);
  const passExpiresAt = passFirstLessonAt ? calculatePassExpirationDateKey(passFirstLessonAt) : cleanDateKey(body.pass_expires_at);

  if (passRegisteredAt && passRegisteredAt >= PASS_POLICY_START_DATE_KEY && passExtensionUntil && passExpiresAt) {
    const maxUntil = maxExtensionDateKey(passExpiresAt);
    if (passExtensionUntil > maxUntil) {
      return {
        error: `연장 기한은 기본 사용기한으로부터 최대 2주(${maxUntil})까지만 입력할 수 있습니다.`,
      };
    }
  }

  return {
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
      return NextResponse.json({ message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }

    const name = String(body.name || "").trim();
    const phoneLast4 = String(body.phone_last4 || "").trim();
    const memo = String(body.memo || "").trim();
    const lessonCredits = Math.max(0, Number(body.lesson_credits || 0));
    const lessonDurationMinutes = normalizeLessonDurationMinutes(body.lesson_duration_minutes);
    const passUpdate = buildPassUpdate(body);

    if (passUpdate.error) {
      return NextResponse.json({ message: passUpdate.error }, { status: 400 });
    }
    if (!name || !phoneLast4) {
      return NextResponse.json({ message: "이름과 핸드폰번호 뒷자리 4자리를 입력해 주세요." }, { status: 400 });
    }
    if (!/^\d{4}$/.test(phoneLast4)) {
      return NextResponse.json({ message: "핸드폰번호 뒷자리 4자리를 숫자로 입력해 주세요." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("students").insert({
      name,
      phone_last4: phoneLast4,
      memo,
      lesson_credits: lessonCredits,
      lesson_duration_minutes: lessonDurationMinutes,
      ...(passUpdate.value || {}),
      is_active: true,
    });

    if (error) {
      if (error.message.includes("duplicate")) {
        return NextResponse.json({ message: "이미 등록된 수강생입니다." }, { status: 409 });
      }
      throw error;
    }
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
