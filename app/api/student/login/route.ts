import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/supabaseAdmin";
import { getErrorMessage, isMissingPassColumnError } from "../../../../lib/supabaseCompat";

const STUDENT_BASE_SELECT = "id, name, phone_last4, lesson_credits, lesson_duration_minutes";
const STUDENT_PASS_SELECT = `${STUDENT_BASE_SELECT}, pass_registered_at, pass_first_lesson_at, pass_expires_at, pass_extension_used, pass_extension_until, pass_extension_reason`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const phoneLast4 = String(body.phone_last4 || "").trim();

    if (!name || !phoneLast4) {
      return NextResponse.json({ message: "이름과 핸드폰번호 뒷자리 4자리를 입력해 주세요." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    let result = await supabase
      .from("students")
      .select(STUDENT_PASS_SELECT)
      .eq("name", name)
      .eq("phone_last4", phoneLast4)
      .eq("is_active", true)
      .maybeSingle();

    // v15에서 수강권 사용기한 칼럼이 추가되었습니다. Supabase SQL을 아직 실행하지 않은 경우에도
    // 기존 로그인은 막히지 않도록 기본 수강생 정보만으로 한 번 더 조회합니다.
    if (result.error && isMissingPassColumnError(result.error)) {
      result = await supabase
        .from("students")
        .select(STUDENT_BASE_SELECT)
        .eq("name", name)
        .eq("phone_last4", phoneLast4)
        .eq("is_active", true)
        .maybeSingle();
    }

    if (result.error) throw result.error;
    if (!result.data) {
      return NextResponse.json({ message: "입력하신 정보와 일치하는 수강생을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ student: result.data });
  } catch (error) {
    return NextResponse.json({ message: getErrorMessage(error) }, { status: 500 });
  }
}
