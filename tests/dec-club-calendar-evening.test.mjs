import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require=createRequire(import.meta.url);
const ts=require("typescript");
const src=(file)=>readFileSync(new URL(file,import.meta.url),"utf8");
const state={exports:{},Date,Intl,Number,Math,Set,Map,String};
vm.runInNewContext(ts.transpileModule(src("../lib/businessRules.ts"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS}
}).outputText,state);
const rules=state.exports;
const asIso=(d,t)=>rules.kstDateTimeToUtcIso(d,t);

for(const day of ["2026-12-05","2026-12-12","2026-12-19","2026-12-26"]) {
 const start=asIso(day,"17:30");
 assert.equal(rules.isDecemberSaturday1730(start),true);
 assert.equal(rules.isRegularLessonSlotForStudent(start,90),true);
 assert.equal(rules.isRegularLessonSlotForStudent(start,45),true);
 assert.equal(rules.isRegularLessonSlotForStudent(start,120),false);
 assert.equal(rules.isLessonWithinOperatingHours(start,90),true);
 assert.equal(rules.isLessonWithinOperatingHours(start,45),true);
 assert.equal(rules.isLessonWithinOperatingHours(start,120),false);
 assert.equal(rules.getReservationLessonMinutes(start,90),90);
 assert.equal(rules.getReservationLessonMinutes(start,45),45);
 assert.equal(rules.getReservationCreditCost(start,90),1);
 assert.equal(rules.lessonEndIso(start,90),asIso(day,"19:00"));
 assert.equal(rules.lessonEndIso(start,45),asIso(day,"18:15"));
}
for(const day of ["2026-11-28","2027-01-02","2026-12-06","2026-12-04"]) {
 assert.equal(rules.isDecemberSaturday1730(asIso(day,"17:30")),false);
 assert.equal(rules.isRegularLessonSlotForStudent(asIso(day,"17:30"),90),false);
}
// The requested Sunday 17:30 regular lesson is available from December onward.
for (const day of ["2026-12-06", "2026-12-13", "2026-12-20", "2026-12-27", "2027-01-03"]) {
 const start = asIso(day, "17:30");
 assert.equal(rules.isSundayEveningRegularSlot(start), true);
 assert.equal(rules.isRegularLessonSlot(start), true);
 assert.equal(rules.isRegularLessonSlotForStudent(start, 90), true);
 assert.equal(rules.isRegularLessonSlotForStudent(start, 45), true);
 assert.equal(rules.isRegularLessonSlotForStudent(start, 120), false);
 assert.equal(rules.isLessonWithinOperatingHours(start, 90), true);
 assert.equal(rules.isLessonWithinOperatingHours(start, 45), true);
 assert.equal(rules.isLessonWithinOperatingHours(start, 120), false);
 assert.equal(rules.lessonEndIso(start, 90), asIso(day, "19:00"));
 assert.equal(rules.getReservationCreditCost(start, 90), 1);
}
for (const day of ["2026-11-29", "2026-12-05", "2026-12-07"]) {
 assert.equal(rules.isSundayEveningRegularSlot(asIso(day, "17:30")), false);
}
const generated = rules.buildTimetableSlots("2026-12-01", 6);
for (const day of ["2026-12-06", "2026-12-13", "2026-12-20", "2026-12-27", "2027-01-03"]) {
 assert.ok(generated.some(row => row.start_at === asIso(day, "17:30")
  && row.end_at === asIso(day, "19:00")), day + " must be generated for future monthly opening");
}
const sundayEvening = asIso("2026-12-06", "17:30");
const sundayLifestyle = asIso("2026-12-06", "16:30");
assert.equal(rules.conflictsWithRegularBookingsAllowingContinuous(sundayEvening,
 rules.lessonEndIso(sundayEvening, 90),
 [{start_at:sundayLifestyle,end_at:rules.lessonEndIso(sundayLifestyle,45)}],false),false);

const day="2026-12-05";
const late=asIso(day,"17:30");
const lifestyle=asIso(day,"16:30");
const lifestyleEnd=rules.lessonEndIso(lifestyle,45);
assert.equal(rules.conflictsWithRegularBookingsAllowingContinuous(late,rules.lessonEndIso(late,90),
 [{start_at:lifestyle,end_at:lifestyleEnd}],false),false,
 "16:30-17:15 lifestyle booking may be followed by 17:30 regular lesson (15-minute gap).");
assert.equal(rules.conflictsWithRegularBookingsAllowingContinuous(asIso(day,"17:00"),
 rules.lessonEndIso(asIso(day,"17:00"),90),
 [{start_at:lifestyle,end_at:lifestyleEnd}],false),true,
 "An actually overlapping lesson must still be blocked.");
const club={start_at:asIso(day,"12:00"),end_at:asIso(day,"14:00"),class_kind:"freewriting"};
assert.equal(rules.conflictsWithOneDayBlocks(late,rules.lessonEndIso(late,90),[club]),false);
const page=src("../app/regular/page.tsx");
assert.match(page,/useStudentExtraClasses\(student/);
assert.match(page,/\.\.\.slots, \.\.\.extras\.entries/);
assert.match(page,/selectedSlots\.map/);
assert.match(page,/timelineBookedBadge/);
assert.match(page,/timelineCancelButton/);
assert.match(page,/timelineInlineNotice/);
assert.doesNotMatch(page,/position:"fixed",bottom:89/);
assert.match(page,/프리 라이팅 클럽<\/strong>은 45분 수강권/);
assert.match(page,/extras\.send\(slot as ExtraClassSlot\)/);
assert.doesNotMatch(page,/<StudentExtraClasses/);
const controller=src("../app/regular/StudentExtraClasses.tsx");
assert.doesNotMatch(controller,/<section className="card"/);
assert.match(controller,(/\[45,90,120\]\.includes\(studentMinutes\)/));
assert.match(controller,/extra_kind:"freewriting"/);
assert.match(controller,/extra_kind:"oneday"/);
assert.match(controller,/window\.setTimeout/);
const slots=src("../app/api/slots/route.ts");
assert.match(slots,/times\.push\("17:30"\)/);
assert.match(slots,/isDecemberSaturday1730/);
assert.match(slots,/isSundayEveningRegularSlot/);
const css=src("../app/globals.css");
assert.match(css,/grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
const home=src("../app/page.tsx");
assert.doesNotMatch(home,/정규 · 프리 라이팅/);
assert.match(home,/<span aria-hidden="true" \/>/);
const sundayMigration=src("../supabase/migrations/20261117_sunday_1730_regular_open.sql");
assert.match(sundayMigration,/on conflict \(start_at\) do nothing/);
assert.doesNotMatch(sundayMigration,/\bdelete\b|\btruncate\b/i);
const history=src("../app/api/student/history/route.ts");
assert.match(history,/mergedOneDay/);
console.log("December calendar: club merged with regular times; 17:30 available to 45/90 only; 120 stays unchanged; existing history preserved.");
