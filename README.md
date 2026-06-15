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


## 30분 단위 타임테이블 규칙

- 월-금: 14:00부터 20:30까지 30분 단위로 시작 가능
- 토요일: 10:00부터 16:30까지 30분 단위로 시작 가능
- 수업 시간은 90분으로 저장됨
- 예약된 수업과 겹치는 슬롯은 예약 화면에서 자동 제외됨
- 예약 및 취소는 수업 시작 6시간 전까지만 가능
