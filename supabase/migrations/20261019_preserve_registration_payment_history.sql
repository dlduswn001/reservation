-- Preserve financial registration history even if a student is later removed.
-- A student with payment records cannot be hard-deleted accidentally.
alter table public.student_registration_payments
  drop constraint if exists student_registration_payments_student_id_fkey;
alter table public.student_registration_payments
  add constraint student_registration_payments_student_id_fkey
  foreign key (student_id) references public.students(id) on delete restrict;
