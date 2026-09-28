-- v37 필수 DB 업데이트: 0.5회 수강권 차감을 저장하기 위해 lesson_credits를 소수점 지원 형식으로 변경합니다.
alter table students
alter column lesson_credits type numeric(8,2) using lesson_credits::numeric,
alter column lesson_credits set default 0;

-- 45분 정규수강권을 학생 유형으로 저장할 수 있게 허용합니다.
alter table students drop constraint if exists students_lesson_duration_valid;
alter table students
add constraint students_lesson_duration_valid
check (lesson_duration_minutes in (45, 90, 120));
