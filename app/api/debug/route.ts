import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export async function GET() {
  const result: Record<string, unknown> = {
    hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    urlLooksValid: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("http")),
    hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasAdminPassword: Boolean(process.env.ADMIN_PASSWORD),
  };

  try {
    const supabase = getSupabaseAdmin();
    const students = await supabase.from("students").select("id, name, phone_last4, lesson_credits", { count: "exact" }).limit(5);
    if (students.error) throw students.error;
    const slots = await supabase.from("available_slots").select("id, start_at, end_at", { count: "exact" }).limit(5);
    if (slots.error) throw slots.error;
    result.supabaseOk = true;
    result.studentsCount = students.count;
    result.slotsCount = slots.count;
    result.sampleStudents = students.data;
    result.sampleSlots = slots.data;
  } catch (error) {
    result.supabaseOk = false;
    result.errorMessage = typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : error instanceof Error
        ? error.message
        : String(error);
  }

  return NextResponse.json(result);
}
