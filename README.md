# 문장학교 예약 사이트 - 깨끗한 새 버전

## 필요한 Vercel Environment Variables

- NEXT_PUBLIC_SUPABASE_URL: Supabase API URL. 예: https://xxxx.supabase.co
- NEXT_PUBLIC_SUPABASE_ANON_KEY: Supabase publishable 또는 anon key
- SUPABASE_SERVICE_ROLE_KEY: Supabase secret 또는 service_role key
- ADMIN_PASSWORD: 관리자 비밀번호. 처음 테스트는 1234 권장

## Supabase에 필요한 테이블

- students
- available_slots
- regular_bookings
- oneday_classes
- oneday_bookings

기존에 만든 테이블을 그대로 사용할 수 있습니다.

## 테스트 순서

1. /admin 접속
2. ADMIN_PASSWORD에 넣은 비밀번호 입력
3. 테스트학생 / 1234 등록
4. 예약 가능 시간 등록
5. /regular에서 테스트학생 / 1234로 입장
6. 빈 시간 예약
