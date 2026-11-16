import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
function compile(relativePath, moduleLoader) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const context = { exports: {}, require: moduleLoader, Intl, Date, Map, Set, Number };
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
  return context.exports;
}
const tuition = compile("../lib/bookingTuition.ts", require);
const revenue = compile("../lib/bookingRevenue.ts", name => {
  if (name === "./bookingTuition") return tuition;
  throw new Error(name);
});
const booking = (id, start_at, status="booked", memo="수강생 직접 예약 / 정규수업") => ({
  id, start_at, end_at: start_at, status, memo
});
const tuitionRow = (id, student_minutes, lesson_minutes, amount_krw=null, confirmed_at=null) => ({
  booking_id:id,student_minutes,lesson_minutes,amount_krw,confirmed_at
});
const b1=booking("1","2026-10-19T06:00:00.000Z");
const b2=booking("2","2026-10-19T07:00:00.000Z");
const b3=booking("3","2026-10-19T08:00:00.000Z","booked","관리자 직접 예약 / 120분 수업");
const b4=booking("4","2026-10-19T09:00:00.000Z","cancelled");
const rows=[tuitionRow("1",90,90),tuitionRow("2",90,45,32500,"2026-10-19T01:00:00Z"),
  tuitionRow("3",120,120,200000),tuitionRow("4",45,45)];
assert.equal(revenue.bookingOrigin(b1),"student");
assert.equal(revenue.bookingOrigin(b3),"admin");
assert.equal(revenue.lessonFee(b1,rows[0]),65000);
assert.equal(revenue.lessonFee(b2,rows[1]),32500);
assert.equal(revenue.lessonFee(b3,rows[2]),200000);
const yang = booking("yang","2026-11-21T08:30:00.000Z","booked",
  "관리자 직접 예약 / 120분 수업 / 수강권 1회 차감 / [연속 120분 수업]");
const yangRow = tuitionRow("yang",120,120,80000,"2026-11-16T02:00:00Z");
assert.equal(revenue.bookingOrigin(yang),"admin");
assert.equal(revenue.isPrepaidPassBooking(yang),true,"Admin-entered credit-deducted lessons are prepaid");
assert.equal(revenue.isPrepaidPassBooking(b3),false,"Non-credit admin lessons remain editable");
assert.equal(revenue.lessonFee(yang,yangRow),80000);
assert.equal(revenue.lessonFee(yang,tuitionRow("yang",120,120)),80000,"Prepaid 120m amount is automatic");
assert.equal(revenue.lessonFee(yang,null),80000,"Legacy 120m memo falls back to 80k when no tuition row");
const tuitionField = readFileSync(new URL("../app/admin/BookingTuitionField.tsx",import.meta.url),"utf8");
assert.match(tuitionField,/bookingOrigin\(booking\) === "admin" && !isPrepaidPassBooking\(booking\)/);

assert.equal(revenue.seoulDayKey(b1.start_at),"2026-10-19");
const day=revenue.dailyLessonRevenue([b1,b2,b3,b4],rows,"2026-10-19");
assert.equal(day.bookings,3);
assert.equal(day.priced,3);
assert.equal(day.unpriced,0);
assert.equal(day.total,297500);
assert.equal(day.confirmed,32500);
assert.equal(revenue.dailyLessonRevenue([b1],[tuitionRow("1",120,120)],"2026-10-19").unpriced,0);
assert.equal(revenue.dailyLessonRevenue([b1],[tuitionRow("1",120,120)],"2026-10-19").total,80000);
assert.equal(revenue.monthlyLessonRevenue([b1,b2,b3,b4],rows,"2026-10").length,1);
console.log("Daily booking fee accounting tests passed");
