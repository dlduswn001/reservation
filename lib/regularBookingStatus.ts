import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 수업 종료 시간이 지난 정규수업 예약을 수강 완료(done) 상태로 바꿉니다.
 * 화면 표시뿐 아니라 DB 상태도 함께 정리하기 위해 조회 API에서 호출합니다.
 */
export async function completePastRegularBookings(
  supabase: SupabaseClient,
  studentId?: string
) {
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("regular_bookings")
    .update({ status: "done", updated_at: nowIso })
    .in("status", ["booked", "change_request"])
    .lte("end_at", nowIso);

  if (studentId) {
    query = query.eq("student_id", studentId);
  }

  const { error } = await query;
  if (error) throw error;
}
