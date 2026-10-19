import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const require=createRequire(import.meta.url);
const ts=require("typescript");
function compile(relativePath, moduleLoader) {
  const src=readFileSync(new URL(relativePath,import.meta.url),"utf8");
  const env={exports:{},require:moduleLoader,Intl,Date,Map,Set,Number};
  vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,env);
  return env.exports;
}
const tuition=compile("../lib/bookingTuition.ts",require);
const booking=compile("../lib/bookingRevenue.ts",name=>{
  if(name==="./bookingTuition")return tuition;
  throw new Error(name);
});
const manual=compile("../lib/blockedTimeRevenue.ts",name=>{
  if(name==="./bookingRevenue")return booking;
  throw new Error(name);
});
const blocks=[
  {id:"a",start_at:"2026-10-19T07:30:00.000Z",end_at:"2026-10-19T09:00:00.000Z"},
  {id:"b",start_at:"2026-10-19T07:30:00.000Z",end_at:"2026-10-19T09:00:00.000Z"},
  {id:"c",start_at:"2026-10-20T07:30:00.000Z",end_at:"2026-10-20T09:00:00.000Z"},
  {id:"d",start_at:"2026-10-19T10:00:00.000Z",end_at:"2026-10-19T11:30:00.000Z"},
];
const fees=[
  {block_id:"a",amount_krw:80000,confirmed_at:"2026-10-19T08:00:00Z",memo:"",updated_at:"2026-10-19T08:30:00Z"},
  {block_id:"b",amount_krw:null,confirmed_at:null,memo:"",updated_at:"2026-10-19T08:30:00Z"},
  {block_id:"c",amount_krw:0,confirmed_at:null,memo:"",updated_at:"2026-10-20T08:30:00Z"},
];
const day=manual.dailyManualLessonRevenue(blocks,fees,"2026-10-19");
assert.equal(day.entries,1);
assert.equal(day.unpriced,1);
assert.equal(day.total,80000);
assert.equal(day.confirmed,80000);
assert.equal(manual.monthlyManualLessonRevenue(blocks,fees,"2026-10").length,2);
const next=manual.dailyManualLessonRevenue(blocks,fees,"2026-10-20");
assert.equal(next.entries,1);
assert.equal(next.total,0);
const bookingData={id:"booked",memo:"수강생 직접 예약",start_at:"2026-10-19T07:30:00.000Z",
 end_at:"2026-10-19T09:00:00.000Z",status:"booked"};
const savedOverride={booking_id:"booked",student_minutes:90,lesson_minutes:90,amount_krw:72000,confirmed_at:null};
assert.equal(booking.lessonFee(bookingData,savedOverride),72000);
assert.equal(booking.dailyLessonRevenue([bookingData],[savedOverride],"2026-10-19").total,72000);
assert.equal(day.total+booking.dailyLessonRevenue([bookingData],[savedOverride],"2026-10-19").total,152000);
console.log("Admin fee override, manual block sales, zero-fee and no-automatic-block-revenue tests passed.");
