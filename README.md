# 문장학교 예약 사이트

## 이번 버전 반영 사항

- 메인 페이지 운영 안내 문구 정리
- 관리자 페이지 비밀번호 안내 문구 정리
- 관리자 페이지에서 수강생 삭제 가능
- 관리자 페이지에서 정규수업 예약 목록을 달력 형태로 확인 가능
- 수강생별 수강권 잔여 횟수 등록 및 수정 가능
- 정규수업 예약 시 수강권 1회 자동 차감
- 수업 6시간 전까지 취소하면 수강권 1회 자동 복구
- 수업 6시간 이내 취소하면 예약은 취소되지만 수강권은 차감된 상태로 유지
- 수업 신청은 수업 시작 6시간 전까지만 가능
- 월-금 14:00-20:30, 토요일 10:00-16:30 사이 30분 단위 슬롯 생성
- 실제 수업은 80분으로 안내하고, 수업 후 10분 정리 시간을 포함해 총 90분 동안 겹치는 예약을 자동 제외

## 반드시 먼저 실행할 SQL

이번 버전은 students 테이블에 lesson_credits 칸이 필요합니다.
Supabase > SQL Editor > New query에서 `SUPABASE_MIGRATION.sql` 내용을 실행해 주세요.

기존 예약 가능 시간의 종료 시간을 80분 기준으로 맞추고 싶으면, 추가로 아래 SQL도 실행해 주세요.

```sql
update available_slots
set end_at = start_at + interval '80 minutes';

update regular_bookings
set end_at = start_at + interval '80 minutes';
```

## Vercel Environment Variables

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- ADMIN_PASSWORD
