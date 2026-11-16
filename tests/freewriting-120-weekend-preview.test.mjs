import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const read=(name)=>readFileSync(new URL("../"+name,import.meta.url),"utf8");

const page=read("app/regular/page.tsx");
const api=read("app/api/freewriting/route.ts");
const hook=read("app/regular/StudentExtraClasses.tsx");
const slots=read("app/api/slots/route.ts");
const booking=read("app/api/book/route.ts");
const migration=read("supabase/migrations/20261116_free_120min_club_pending_final_approval.sql");

// A real December Korean calendar: Wed–Fri are tappable for a message, not online bookings.
const fnSource=page.match(/function isWeekdayInquiryDateKey\(dateKey: string\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(fnSource,"Missing weekday inquiry helper");
const isWeekday=vm.runInNewContext("("+fnSource.replace("dateKey: string","dateKey")+")",{Date,Number});
for(const key of ["2026-12-02","2026-12-03","2026-12-04","2026-12-09","2026-12-10","2026-12-11"]){
 assert.equal(isWeekday(key),true,"Must show Kakao inquiry for "+key);
}
for(const key of ["2026-12-05","2026-12-06","2026-12-07","2026-12-08","2026-12-12","2026-12-13"]){
 assert.equal(isWeekday(key),false,"This is not a Wed–Fri date "+key);
}
assert.equal(isWeekday("junk"),false);

assert.match(page,/isExtended120Student && isWeekdayInquiryDateKey\(key\)\) continue/);
assert.match(page,/if \(key >= today && isWeekdayInquiryDateKey\(key\)\) grouped\[key\] = \[\]/);
assert.match(page,/selectedInquiryDay &&/);
assert.match(page,/!selectedInquiryDay && selectedSlots\.map/);
assert.match(page,/카카오톡으로 문의하기/);
assert.match(page,/\/\/_?xcxbGwn\/chat|pf\.kakao\.com\/_xcxbGwn\/chat/);
assert.match(page,/프리 라이팅 클럽은 무료/);
assert.match(page,/freewriting/);

assert.match(slots,/extendedSelfBookingAllowed &&[\s\S]{0,125}\["Sat","Sun"\]\.includes\(slotWeekday\(slot\.start_at\)\)/);
assert.match(booking,/isExtendedSelfBooking && !\["Sat","Sun"\]\.includes\(weekdayKst\)/);
assert.match(booking,/카카오톡으로 희망 날짜와 시간을 별도로 문의해 주세요/);

// Student UI includes a zero-credit 120m participant; other pass types unchanged.
assert.match(hook,/creditCost=studentMinutes===120\?0:studentMinutes===45\?1:0\.5/);
assert.match(hook,/\[45,90,120\]\.includes\(studentMinutes\)/);
assert.match(hook,/무료 참여 \(수강권 차감 없음\)/);
assert.match(api,/\[45,90,120\]\.includes\(Number\(student\.lesson_duration_minutes\)\)/);

// Security of the real database migration: free booking occupies one seat but touches no pass fields.
assert.match(migration,/elsif s\.lesson_duration_minutes=120 then cost:=0/);
assert.match(migration,/elsif s\.lesson_duration_minutes=90 then cost:=0\.5/);
assert.match(migration,/if s\.lesson_duration_minutes=45 then cost:=1/);
assert.match(migration,/if cost>0 then\s*update public\.students set/);
assert.match(migration,/if b\.credits_deducted>0 then\s*update public\.students/);
assert.match(migration,/if b\.status<>'등록완료' then/);
assert.match(migration,/filled>=c\.capacity/);
assert.match(migration,/grant execute on function public\.munjang_freewriting_book\(uuid,uuid\) to service_role/);
assert.doesNotMatch(migration,/delete from public\.oneday_bookings/i);

console.log("REVIEW: 120m free club, 45/90 deductions, no pass modification, weekdays inquiry, weekend booking restrictions verified.");
