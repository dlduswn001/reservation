-- Run after migration inside a transaction, then ROLLBACK. No real payment writes.
do $$
begin
  assert public.munjang_default_booking_tuition(90,90)=65000;
  assert public.munjang_default_booking_tuition(45,45)=40000;
  assert public.munjang_default_booking_tuition(90,45)=32500;
  assert public.munjang_default_booking_tuition(120,120) is null;
  assert public.munjang_default_booking_tuition(45,90) is null;
  assert public.munjang_default_booking_tuition(null,45) is null;
  assert not has_table_privilege('anon','public.booking_tuition','SELECT');
  assert not has_table_privilege('authenticated','public.booking_tuition','UPDATE');
  assert has_table_privilege('service_role','public.booking_tuition','SELECT,INSERT,UPDATE');
  assert (select relrowsecurity from pg_class where oid='public.booking_tuition'::regclass);
  assert not has_function_privilege('anon','public.munjang_initialize_booking_tuition()','EXECUTE');
  assert (select count(*) from public.booking_tuition)=(select count(*) from public.regular_bookings);
  assert not exists(select 1 from public.booking_tuition where confirmed_at is not null);
end $$;

-- Exercise the insert trigger on a temporary surrogate, without creating a booking.
create temporary table tuition_trigger_probe (id uuid, student_id uuid, start_at timestamptz, end_at timestamptz);
create trigger tuition_probe after insert on tuition_trigger_probe
for each row execute function public.munjang_initialize_booking_tuition();
do $$
declare sample_id uuid;
declare student_id uuid;
declare student_duration integer;
declare stamp timestamptz;
declare affected integer;
begin
  select b.id,b.student_id,s.lesson_duration_minutes into sample_id,student_id,student_duration
  from public.regular_bookings b join public.students s on s.id=b.student_id limit 1;
  if sample_id is null then raise exception 'No booking available for rollback-only fixture'; end if;
  delete from public.booking_tuition where booking_id=sample_id;
  insert into tuition_trigger_probe values(sample_id,student_id,now(),now()+interval '45 minutes');
  assert (select amount_krw from public.booking_tuition where booking_id=sample_id)
    is not distinct from public.munjang_default_booking_tuition(student_duration,45);
  select updated_at into stamp from public.booking_tuition where booking_id=sample_id;
  update public.booking_tuition set amount_krw=12345,confirmed_at=now(),memo='rollback-only test',updated_at=clock_timestamp()
    where booking_id=sample_id and updated_at=stamp;
  get diagnostics affected=row_count;
  assert affected=1;
  assert (select amount_krw=12345 and confirmed_at is not null and memo='rollback-only test'
    from public.booking_tuition where booking_id=sample_id);
  update public.booking_tuition set amount_krw=999 where booking_id=sample_id and updated_at=stamp;
  get diagnostics affected=row_count;
  assert affected=0, 'stale update must not overwrite';
  begin
    update public.booking_tuition set amount_krw=-1 where booking_id=sample_id;
    raise exception 'negative amount accepted';
  exception when check_violation then null;
  end;
  begin
    update public.booking_tuition set amount_krw=null where booking_id=sample_id;
    raise exception 'confirmed payment without amount accepted';
  exception when check_violation then null;
  end;
  update public.booking_tuition set confirmed_at=null,amount_krw=null where booking_id=sample_id;
  assert (select confirmed_at is null and amount_krw is null from public.booking_tuition where booking_id=sample_id);
end $$;
