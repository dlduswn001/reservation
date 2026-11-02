import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
function source(path) { return readFileSync(new URL(path, import.meta.url), "utf8"); }
const context = { exports: {}, Date, Intl, Math, Number, String, Set, Map };
vm.runInNewContext(ts.transpileModule(source("../lib/businessRules.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText, context);
const rules = context.exports;
const iso = (date,time)=>rules.kstDateTimeToUtcIso(date,time);
const days = [
  { date:"2026-11-02", weekday:"Mon", times:["14:00","17:00","19:00"], shouldOpen:false },
  { date:"2026-11-03", weekday:"Tue", times:["14:00","17:00","19:00"], shouldOpen:false },
  { date:"2026-11-04", weekday:"Wed", times:["14:00","17:00","19:00"], shouldOpen:true },
  { date:"2026-11-05", weekday:"Thu", times:["14:00","17:00","19:00"], shouldOpen:true },
  { date:"2026-11-06", weekday:"Fri", times:["14:00","17:00","19:00"], shouldOpen:true },
  { date:"2026-11-07", weekday:"Sat", times:["10:00","13:00","14:40"], shouldOpen:true },
  { date:"2026-11-08", weekday:"Sun", times:["10:00","13:00","14:40"], shouldOpen:true },
];
for (const {date,weekday,times,shouldOpen} of days) {
  for (const time of times) {
    const start=iso(date,time);
    assert.equal(rules.isExtendedLessonSlot(start),shouldOpen,weekday+" "+time+" opening");
    assert.equal(rules.isLessonWithinOperatingHours(start,120),shouldOpen,weekday+" "+time+" hours");
    if (shouldOpen) {
      assert.equal(rules.getReservationLessonMinutes(start,120),120);
      assert.equal(rules.getReservationCreditCost(start,120),1);
    }
  }
}
assert.equal(rules.isExtendedLessonSlot(iso("2026-11-04","15:40")),false);
assert.equal(rules.isExtendedLessonSlot(iso("2026-11-04","20:40")),false);
assert.equal(rules.isExtendedLessonSlot(iso("2026-11-07","12:00")),false);
assert.equal(rules.isExtendedLessonSlot(iso("2026-11-07","16:30")),false);

const saturday="2026-11-07";
const one = iso(saturday,"13:00");
const overlapping = iso(saturday,"14:40");
const ten = iso(saturday,"10:00");
const end = start => rules.lessonEndIso(start,120);
assert.equal(rules.conflictsWithRegularBookings(one,end(one),
  [{start_at:overlapping,end_at:end(overlapping)}]),true,
  "13:00 booked must close 14:40");
assert.equal(rules.conflictsWithRegularBookings(overlapping,end(overlapping),
  [{start_at:one,end_at:end(one)}]),true,
  "14:40 booked must close 13:00");
assert.equal(rules.conflictsWithRegularBookings(ten,end(ten),
  [{start_at:one,end_at:end(one)}]),false,
  "10:00 and 13:00 are separated by the required break");
const wednesday="2026-11-04";
const five=iso(wednesday,"17:00");
const seven=iso(wednesday,"19:00");
assert.equal(rules.conflictsWithRegularBookings(five,end(five),
  [{start_at:seven,end_at:end(seven)}]),true,
  "2h lesson needs a break before 19:00");
assert.equal(rules.conflictsWithRegularBookings(iso(saturday,"14:40"),end(iso(saturday,"14:40")),
  [{start_at:iso(saturday,"16:30"),end_at:rules.lessonEndIso(iso(saturday,"16:30"),45)}]),true,
  "14:40 lesson closes overlapping lifestyle appointment");
const bookingRoute=source("../app/api/book/route.ts");
const slotsRoute=source("../app/api/slots/route.ts");
assert.match(bookingRoute,/student\.extended_self_booking_enabled === true/);
assert.match(bookingRoute,/isLessonWithinOperatingHours\(slot\.start_at, slotLessonMinutes\)/);
assert.match(bookingRoute,/alreadyTaken/);
assert.match(slotsRoute,/student\.extended_self_booking_enabled === true/);
assert.match(slotsRoute,/extendedSelfBookingAllowed && isRegularOccupied\(slot\)/);
assert.match(slotsRoute,/!extendedSelfBookingAllowed && isSlotAvailable\(slot\) && isRegularOccupied\(slot\)/);
assert.match(slotsRoute,/slot\.is_open === false/);
const migration=source("../supabase/migrations/20261102_extended_120_self_booking.sql");
assert.match(migration,/default false/);
console.log("120-minute opt-in: Wed-Fri only, weekend 3 choices, break/collision closure and scope checks passed.");
