import { NextResponse } from "next/server";
import { checkAdminPassword, getAdminPasswordErrorMessage } from "../../../../../lib/admin";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";
import { normalizeLessonDurationMinutes } from "../../../../../lib/businessRules";
import {
  calculatePassExpirationDateKey,
  cleanDateKey,
} from "../../../../../lib/passPolicy";
import { isMissingPassColumnError } from "../../../../../lib/supabaseCompat";

function errorMessage(error: unknown) {
  return typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message)
    : error instanceof Error
      ? error.message
      : "오류가 발생했습니다.";
}

function buildPassUpdate(body: Record<string, unknown>) {
  // The simplified admin form intentionally does NOT supply first lesson,
  // existing extension fields or private memo. Their stored values must
  // survive credit and account edits. Students' first reservation sets
  // pass_first_lesson_at in the booking API.
  const value: Record<string, unknown> = {};
  if ("pass_registered_at" in body) {
    value.pass_registered_at = cleanDateKey(body.pass_registered_at);
  }
  if ("pass_first_lesson_at" in body) {
    const firstLesson = cleanDateKey(body.pass_first_lesson_at);
    value.pass_first_lesson_at = firstLesson;
    value.pass_expires_at = firstLesson
      ? calculatePassExpirationDateKey(firstLesson)
      : null;
  }
  if ("pass_extension_until" in body) {
    value.pass_extension_until = cleanDateKey(body.pass_extension_until);
  }
  if ("pass_extension_used" in body) {
    value.pass_extension_used = Boolean(body.pass_extension_used);
  }
  if ("pass_extension_reason" in body) {
    value.pass_extension_reason = String(body.pass_extension_reason || "").trim() || null;
  }
  return { error: null as string | null, value };
}

export async function PATCH(request: Request, context: { params: Promise<{ studentId: string }> }) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }

    const { studentId } = await context.params;
    const name = String(body.name || "").trim();
    const phoneLast4 = String(body.phone_last4 || "").trim();
    const memo = String(body.memo || "").trim();
    const lessonCredits = Number(body.lesson_credits ?? 0);
    const isActive = body.is_active !== false;
    const lessonDurationMinutes = normalizeLessonDurationMinutes(body.lesson_duration_minutes);
    const passUpdate = buildPassUpdate(body);

    if (passUpdate.error) {
      return NextResponse.json({ message: passUpdate.error }, { status: 400 });
    }
    if (!name || !/^\d{4}$/.test(phoneLast4)) {
      return NextResponse.json({ message: "이름과 핸드폰번호 뒷자리 4자리를 정확히 입력해 주세요." }, { status: 400 });
    }
    if (!Number.isFinite(lessonCredits) || lessonCredits < 0) {
      return NextResponse.json({ message: "수강권 횟수는 0 이상의 숫자로 입력해 주세요." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const basePayload = {
      name,
      phone_last4: phoneLast4,
      // Preserve the existing private memo if the new UI does not show it.
      ...("memo" in body ? { memo } : {}),
      lesson_credits: Number(lessonCredits.toFixed(2)),
      lesson_duration_minutes: lessonDurationMinutes,
      is_active: isActive,
    };

    let { error } = await supabase
      .from("students")
      .update({
        ...basePayload,
        ...(passUpdate.value || {}),
      })
      .eq("id", studentId);

    if (error && isMissingPassColumnError(error)) {
      const fallback = await supabase
        .from("students")
        .update(basePayload)
        .eq("id", studentId);
      error = fallback.error;
    }

    if (error) {
      if (error.message.toLowerCase().includes("duplicate")) {
        return NextResponse.json({ message: "같은 이름과 전화번호 뒷자리로 등록된 수강생이 이미 있습니다." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ studentId: string }> }) {
  try {
    const body = await request.json();
    if (!checkAdminPassword(body.password)) {
      return NextResponse.json({ message: getAdminPasswordErrorMessage() }, { status: 401 });
    }
    const { studentId } = await context.params;
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("students")
      .delete()
      .eq("id", studentId);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: errorMessage(error) }, { status: 500 });
  }
}
