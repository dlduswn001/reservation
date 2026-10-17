-- Admin-only teaching diary. Separate from student_lesson_history (which students can view).
CREATE TABLE IF NOT EXISTS public.student_lesson_diaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  lesson_at timestamptz NOT NULL,
  title text NOT NULL,
  lesson_notes text NOT NULL DEFAULT '',
  feedback text NOT NULL DEFAULT '',
  homework text NOT NULL DEFAULT '',
  message_text text NOT NULL DEFAULT '',
  delivery_status text NOT NULL DEFAULT 'draft'
    CHECK (delivery_status IN ('draft', 'sent')),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_lesson_diaries_title_nonempty CHECK (length(btrim(title)) > 0),
  CONSTRAINT student_lesson_diaries_sent_only_if_timestamp
    CHECK (delivery_status <> 'sent' OR sent_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS student_lesson_diaries_student_lesson_idx
 ON public.student_lesson_diaries(student_id, lesson_at DESC, created_at DESC);
ALTER TABLE public.student_lesson_diaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_lesson_diaries FROM anon, authenticated;
GRANT ALL ON public.student_lesson_diaries TO service_role;
COMMENT ON TABLE public.student_lesson_diaries IS
 '관리자 전용 수강일지. student_lesson_history와 달리 수강생 예약 화면에 노출하지 않습니다. 자동 발송 미연동 시 draft 유지.';
