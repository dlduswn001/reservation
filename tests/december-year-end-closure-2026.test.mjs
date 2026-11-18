import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const ctx={exports:{},Date,Intl,Number,String,Set,Map,Math};
vm.runInNewContext(ts.transpileModule(read("../lib/businessRules.ts"),{
 compilerOptions:{module:ts.ModuleKind.CommonJS}
}).outputText,ctx);
const r=ctx.exports;
assert.equal(r.isSchoolClosedDateKey("2026-12-30"),true);
assert.equal(r.isSchoolClosedDateKey("2026-12-31"),true);
for (const day of ["2026-12-29","2027-01-01","2027-12-30","2027-12-31","2026-12-26"]) {
 assert.equal(r.isSchoolClosedDateKey(day),false,"Other dates must not be blocked: "+day);
}
for (const day of ["2026-12-30","2026-12-31"]) {
 assert.equal(r.isSchoolClosedLessonStart(r.kstDateTimeToUtcIso(day,"14:00")),true);
 assert.equal(r.isSchoolClosedLessonStart(r.kstDateTimeToUtcIso(day,"20:40")),true);
 assert.equal(r.isSchoolClosedLessonStart(r.kstDateTimeToUtcIso(day,"00:30")),true);
}
const slots=read("../app/api/slots/route.ts");
assert.match(slots,/isSchoolClosedDateKey\(dateKey\)\) return false/);
const book=read("../app/api/book/route.ts");
assert.match(book,/if \(isSchoolClosedLessonStart\(slot\.start_at\)\)/);
assert.match(book,/연말 휴무일로 예약할 수 없습니다/);
const waitlist=read("../app/api/regular-waitlist/route.ts");
assert.match(waitlist,/if\(isSchoolClosedLessonStart\(waitSlot\.start_at\)\)/);
const club=read("../app/api/freewriting/route.ts");
assert.match(club,/activeClasses=\(classes\|\|\[\]\)\.filter\(c=>!isSchoolClosedLessonStart\(c\.start_at\)\)/);
assert.match(club,/if\(isSchoolClosedLessonStart\(club\.start_at\)\)/);
const oneday=read("../app/api/oneday/route.ts");
assert.match(oneday,/activeClasses = \(classes \|\| \[\]\)\.filter\(c=>!isSchoolClosedLessonStart\(c\.start_at\)\)/);
const student=read("../app/regular/page.tsx");
assert.match(student,/if \(isSchoolClosedDateKey\(key\)\) continue/);
assert.match(student,/isWeekdayInquiryDateKey\(key\) && !isSchoolClosedDateKey\(key\)/);
assert.match(student,/const dayStatus = isSchoolClosedDateKey\(dateKey\) \? "연말 휴무"/);
assert.match(student,/12월 30일\(수\)~31일\(목\)은 문장학교 연말 휴무/);
const migration=read("../supabase/migrations/20261118_year_end_2026_closure.sql");
assert.match(migration,/update public\.available_slots set is_open=false/);
assert.match(migration,/insert into public\.blocked_times/);
assert.doesNotMatch(migration,/delete from public\.(students|regular_bookings|oneday_bookings)/i);
console.log("2026 Dec 30–31 school closure: both days closed, other dates unchanged, online bookings and waitlists guarded.");
