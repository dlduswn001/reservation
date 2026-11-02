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
const testSlot = (date,time,minutes,is_lifestyle=false) => ({
  start_at:iso(date,time),lesson_minutes:minutes,is_lifestyle
});
assert.equal(rules.isExtended120VisibleSlot(testSlot("2026-11-04","14:00",120)),true);
assert.equal(rules.isExtended120VisibleSlot(testSlot("2026-11-04","17:00",120)),true);
assert.equal(rules.isExtended120VisibleSlot(testSlot("2026-11-07","14:40",120)),true);
assert.equal(rules.isExtended120VisibleSlot(testSlot("2026-11-04","15:40",45,true)),false,
  "45-minute lifestyle time must be hidden, even if it arrives marked closed");
assert.equal(rules.isExtended120VisibleSlot(testSlot("2026-11-07","12:00",45,true)),false);
assert.equal(rules.isExtended120VisibleSlot(testSlot("2026-11-07","16:30",45,true)),false);
assert.equal(rules.isExtended120VisibleSlot(testSlot("2026-11-04","14:00",45)),false,
  "even a valid 120-minute start must not show a 45-minute row");
assert.equal(rules.isExtended120VisibleSlot(testSlot("2026-11-07","13:00",120,true)),false,
  "any lifestyle-labelled row must be excluded");
assert.equal(rules.isExtended120VisibleSlot(testSlot("2026-11-04","20:40",120)),false);
assert.equal(rules.isExtended120VisibleSlot(testSlot("2026-11-03","14:00",120)),false);


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
  "normal classes still require a break");
assert.equal(rules.conflictsWithRegularBookingsAllowingContinuous(five,end(five),
  [{start_at:seven,end_at:end(seven)}],true),false,
  "approved 120-minute class at 17:00 must leave 19:00 available");
assert.equal(rules.conflictsWithRegularBookingsAllowingContinuous(seven,end(seven),
  [{start_at:five,end_at:end(five),memo:rules.CONTINUOUS_120_BOOKING_TAG}]),false,
  "next class may start exactly when approved 120-minute class ends");
assert.equal(rules.conflictsWithRegularBookingsAllowingContinuous(seven,end(seven),
  [{start_at:five,end_at:end(five)}]),true,
  "unmarked normal class still reserves the 30-minute break");
assert.equal(rules.conflictsWithRegularBookingsAllowingContinuous(one,end(one),
  [{start_at:overlapping,end_at:end(overlapping)}],true),true,
  "overlapping 13:00 and 14:40 classes are never allowed");
assert.equal(rules.conflictsWithRegularBookingsAllowingContinuous(overlapping,end(overlapping),
  [{start_at:one,end_at:end(one),memo:rules.CONTINUOUS_120_BOOKING_TAG}]),true,
  "existing opted-in class closes actual overlap");
const regularEnd=rules.lessonEndIso(seven,90);
assert.equal(rules.conflictsWithRegularBookingsAllowingContinuous(seven,regularEnd,
  [{start_at:five,end_at:end(five),memo:rules.CONTINUOUS_120_BOOKING_TAG}]),false,
  "other students can take the 19:00 regular class after 17:00~19:00 opt-in class");
assert.equal(rules.conflictsWithRegularBookingsAllowingContinuous(iso(wednesday,"15:40"),
  rules.lessonEndIso(iso(wednesday,"15:40"),45),
  [{start_at:iso(wednesday,"14:00"),end_at:end(iso(wednesday,"14:00")),memo:rules.CONTINUOUS_120_BOOKING_TAG}]),true,
  "other students cannot use a lifestyle lesson actually overlapping the opt-in class");
assert.equal(rules.conflictsWithRegularBookings(iso(saturday,"14:40"),end(iso(saturday,"14:40")),
  [{start_at:iso(saturday,"16:30"),end_at:rules.lessonEndIso(iso(saturday,"16:30"),45)}]),true,
  "14:40 lesson closes overlapping lifestyle appointment");
const bookingRoute=source("../app/api/book/route.ts");
const slotsRoute=source("../app/api/slots/route.ts");
assert.match(bookingRoute,/student\.extended_self_booking_enabled === true/);
assert.match(bookingRoute,/isExtendedSelfBooking && !isExtendedLessonSlot\(slot\.start_at\)/);
assert.match(bookingRoute,/isLessonWithinOperatingHours\(slot\.start_at, slotLessonMinutes\)/);
assert.match(bookingRoute,/alreadyTaken/);
assert.match(bookingRoute,/conflictsWithRegularBookingsAllowingContinuous\(slot\.start_at, candidateEndAt, \[booking\], isExtendedSelfBooking\)/);
assert.match(bookingRoute,/CONTINUOUS_120_BOOKING_TAG/);
assert.match(slotsRoute,/conflictsWithRegularBookingsAllowingContinuous\(slot\.start_at, end, \[booking\], extendedSelfBookingAllowed\)/);
const regularPage=source("../app/regular/page.tsx");
assert.match(regularPage,/isExtended120VisibleSlot\(slot\)/);
assert.doesNotMatch(regularPage,/<p style=\{styles\.helperText\}>표시되지 않는 일정은 예약 마감된 일정입니다\.<\/p>/);
assert.doesNotMatch(regularPage,/120분 정규수업 · 수~금 오후 2시\/5시\/7시/);
assert.match(slotsRoute,/extendedSelfBookingAllowed\s*\? \(weekday === 0 \|\| weekday === 6 \? EXTENDED_WEEKEND_START_TIMES : EXTENDED_WEEKDAY_START_TIMES\)/);

assert.match(regularPage,/extendedAutoBookable/);
assert.match(regularPage,/const isDirectScheduleStudent = studentLessonMinutes === 120 && !extendedAutoBookable/);

assert.match(slotsRoute,/student\.extended_self_booking_enabled === true/);
assert.match(slotsRoute,/extendedSelfBookingAllowed && !isExtendedLessonSlot\(slot\.start_at\)/);
assert.match(slotsRoute,/extendedSelfBookingAllowed && isRegularOccupied\(slot\)/);
assert.match(slotsRoute,/!extendedSelfBookingAllowed && isSlotAvailable\(slot\) && isRegularOccupied\(slot\)/);
assert.match(slotsRoute,/slot\.is_open === false/);
const migration=source("../supabase/migrations/20261102_extended_120_self_booking.sql");
assert.match(migration,/default false/);
console.log("120-minute opt-in: shared reservation page, no 30-minute break, actual overlap only, and normal class policy verified.");
