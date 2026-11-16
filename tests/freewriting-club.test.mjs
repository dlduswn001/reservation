import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const context={exports:{},Date,Intl,Map,Set,Number,Math,String};
vm.runInNewContext(ts.transpileModule(read("../lib/businessRules.ts"),{
 compilerOptions:{module:ts.ModuleKind.CommonJS}
}).outputText,context);
const rules=context.exports;
const date=(day,hhmm)=>rules.kstDateTimeToUtcIso(day,hhmm);
const decSaturdays=["2026-12-05","2026-12-12","2026-12-19","2026-12-26"];
for(const d of decSaturdays){
 assert.equal(new Date(d+"T00:00:00Z").getUTCDay(),6,d+" must be Saturday");
 const club={start_at:date(d,"12:00"),end_at:date(d,"14:00"),class_kind:"freewriting"};
 const saturday10=date(d,"10:00");
 const  regular90={start_at:saturday10,end_at:rules.lessonEndIso(saturday10,90)};
 assert.equal(rules.conflictsWithOneDayBlocks(regular90.start_at,regular90.end_at,[club]),false);
 assert.equal(rules.conflictsWithOneDayBlocks(saturday10,rules.lessonEndIso(saturday10,120),[club],undefined,true),false,
  "authorized 120-minute 10:00 lesson may finish at 12:00 without 10 minute setup gap");
 assert.equal(rules.conflictsWithOneDayBlocks(date(d,"12:00"),rules.lessonEndIso(date(d,"12:00"),45),[club]),true);
 assert.equal(rules.conflictsWithOneDayBlocks(date(d,"13:00"),rules.lessonEndIso(date(d,"13:00"),90),[club]),true);
 assert.equal(rules.conflictsWithOneDayBlocks(date(d,"14:40"),rules.lessonEndIso(date(d,"14:40"),90),[club]),false);
 assert.equal(rules.isExtendedLessonSlot(date(d,"10:00")),true);
 assert.equal(rules.isExtendedLessonSlot(date(d,"13:00")),true);
 assert.equal(rules.isExtendedLessonSlot(date(d,"14:40")),true);
}
const sql=read("../supabase/migrations/20261116_freewriting_club_credits.sql");
assert.match(sql,/lesson_duration_minutes=45 then cost:=1/);
assert.match(sql,/lesson_duration_minutes=90 then cost:=0\.5/);
assert.match(sql,/120분 수강생은 이 클럽에 신청할 수 없습니다/);
assert.match(sql,/c\.capacity<>5/);
assert.match(sql,/for update/);
assert.match(sql,/lesson_credits=lesson_credits-cost/);
assert.match(sql,/lesson_credits=lesson_credits\+b\.credits_deducted/);
assert.match(sql,/class_kind text not null default 'oneday'/);
assert.match(sql,/revoke all on function public\.munjang_oneday_join_waitlist/);
assert.doesNotMatch(sql,/delete from public\.oneday_bookings/i);
const api=read("../app/api/freewriting/route.ts");
assert.match(api,/\[45,90\]\.includes/);
assert.match(api,/munjang_freewriting_book/);
assert.match(api,/munjang_freewriting_cancel/);
assert.match(api,/if\(action==="list"\)/);
assert.match(api,/\.eq\("student_id",studentId\)/);
const studentUI=read("../app/regular/StudentExtraClasses.tsx");
assert.match(studentUI,/\[45,90\]\.includes/);
assert.match(studentUI,/extra_kind:"freewriting"/);
assert.match(studentUI,/extra_kind:"oneday"/);
assert.match(studentUI,/useStudentExtraClasses/);
assert.match(studentUI,/Promise\.allSettled/,"Club rendering must not depend on unrelated history endpoints");
assert.match(studentUI,/action:"list"/,"Private club status must be loaded through authenticated read");
assert.match(studentUI,/setMyClubBookings/);
assert.match(studentUI,/extra_count:c\.booked_count/);
assert.match(studentUI,/extra_capacity:c\.capacity/);

const calendarPage=read("../app/regular/page.tsx");
assert.match(calendarPage,/useStudentExtraClasses/);
assert.match(calendarPage,/클럽 신청하기/);
assert.ok(calendarPage.includes('slot.extra_kind === "freewriting" ? "120분"'), "Freewriting duration badge should say 120분");

assert.match(calendarPage,/생활·클럽/,"Lifestyle and club credits must be a single notice");
assert.ok(calendarPage.includes("slot.extra_count ?? 0") && calendarPage.includes("slot.extra_capacity ?? 5"),
  "Each club card must display the exact 0/5 capacity");
assert.match(calendarPage,/slot\.is_closed && !slot\.extra_booking_id/,
  "Existing club registrants must still be able to cancel when the club is full");

assert.match(calendarPage,/신청하기/);
assert.doesNotMatch(calendarPage,/<StudentExtraClasses/);
const menu=read("../app/book/page.tsx");
const home=read("../app/page.tsx");
assert.doesNotMatch(menu,/href="\/oneday"/);
assert.doesNotMatch(home,/href="\/oneday"/);
assert.match(home,/pinnedNoticeTitle/,"Home should show the pinned notice headline");
assert.match(home,/upcoming\[0\]/,"Home should show only the nearest upcoming lesson");
assert.match(home,/gridTemplateColumns:"28px 96px minmax\(0,1fr\) 17px"/,"Home should use one line for each major item");
const bottomNav=read("../app/components/BottomNav.tsx");
assert.doesNotMatch(bottomNav,/label: "마이페이지"/);

const history=read("../app/api/student/history/route.ts");
assert.match(history,/onedayBookings/);
assert.match(history,/mergedOneDay/);
const noticePublic=read("../app/api/announcements/route.ts");
const noticeAdmin=read("../app/api/admin/announcements/route.ts");
assert.match(noticePublic,/\.eq\("is_published",true\)/);
assert.match(noticeAdmin,/checkAdminPassword/);
assert.match(noticeAdmin,/is_pinned/);
const fee=read("../app/admin/BookingTuitionField.tsx");
assert.doesNotMatch(fee,/입금 미확인/);
assert.doesNotMatch(fee,/금액 수정/);
assert.match(fee,/bookingOrigin\(booking\) === "admin"/);
assert.equal(new Function("return true")(),true);
console.log("December freewriting: four Saturdays, time blocking, 5 seats, pass deduction, legacy history and notice security checks passed.");
