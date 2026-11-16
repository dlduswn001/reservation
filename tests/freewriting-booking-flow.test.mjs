import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const src = readFileSync(new URL("../app/api/freewriting/route.ts",import.meta.url),"utf8");
const studentId = "00000000-0000-0000-0000-000000000001";
const classId = "00000000-0000-0000-0000-000000000002";
const bookingId = "00000000-0000-0000-0000-000000000003";
const classes = [{
 id:classId,title:"프리 라이팅 클럽",class_kind:"freewriting",capacity:5,is_open:true,
 start_at:"2026-12-05T03:00:00Z",end_at:"2026-12-05T05:00:00Z"
}];
let bookings=[];

function query(table) {
  const filters=[];
  const q={
    select(){return q;},
    eq(name,value){filters.push(row=>row[name]===value);return q;},
    gte(name,value){filters.push(row=>String(row[name])>=value);return q;},
    in(name,items){filters.push(row=>items.includes(row[name]));return q;},
    order(){return q;},
    async maybeSingle(){
      if(table==="students")return {data:{
        id:studentId,name:"테스트 수강생",phone_last4:"0000",lesson_duration_minutes:90,
        is_active:true,manual_enrollment_status:null
      },error:null};
      return {data:null,error:null};
    },
    then(resolve,reject) {
      const rows=(table==="oneday_classes"?classes:table==="oneday_bookings"?bookings:[])
        .filter(row=>filters.every(fn=>fn(row)));
      return Promise.resolve({data:rows,error:null}).then(resolve,reject);
    }
  };
  return q;
}
const db={
  from:query,
  async rpc(name,args) {
    if(name==="munjang_freewriting_book") {
      if(bookings.some(b=>b.student_id===args.p_student_id&&b.class_id===args.p_class_id&&b.status==="등록완료")) {
        return {data:null,error:{message:"이미 신청한 클럽입니다."}};
      }
      bookings=[...bookings,{id:bookingId,class_id:args.p_class_id,
        student_id:args.p_student_id,status:"등록완료",people_count:1}];
      return {data:{ok:true,booking_id:bookingId,credit_cost:0.5,remaining:3.5},error:null};
    }
    if(name==="munjang_freewriting_cancel") {
      bookings=bookings.map(b=>b.id===args.p_booking_id?{...b,status:"취소완료"}:b);
      return {data:{ok:true,refunded_credits:0.5},error:null};
    }
    throw Error(name);
  }
};
const context={
 exports:{},Date,URL,Request,Number,String,Array,
 require(name){
   if(name==="next/server")return {NextResponse:{json:(data,options={})=>({
     status:options.status??200,data
   })}};
   if(name.endsWith("/supabaseAdmin"))return {getSupabaseAdmin:()=>db};
   if(name.endsWith("/supabaseCompat"))return {getErrorMessage:e=>String(e?.message||e)};
   throw Error(name);
 }
};
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInNewContext(js + "\\nexports.__checkId = value => UUID.test(value);",context);
const get=()=>context.exports.GET();
const post=body=>context.exports.POST(new Request("http://localhost/api/freewriting",{
 method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
}));
const base={studentId,name:"테스트 수강생",phone_last4:"0000"};
assert.equal(context.exports.__checkId(base.studentId),true,"Mock UUID rejected: "+JSON.stringify(base));
const initial=(await get()).data;
assert.equal(initial.sessions.length,1);
assert.equal(initial.sessions[0].capacity,5);
assert.equal(initial.sessions[0].booked_count,0);
const firstListResponse=await post({...base,action:"list"});
assert.equal(firstListResponse.status,200,JSON.stringify(firstListResponse));
let my=firstListResponse.data;
assert.equal(my.my_bookings.length,0);
const booked=await post({...base,action:"book",classId});
assert.equal(booked.status,200);
assert.equal(booked.data.ok,true);
assert.equal(booked.data.credit_cost,0.5);
assert.equal(booked.data.booking_id,bookingId);
assert.equal((await get()).data.sessions[0].booked_count,1,
 "Public capacity count must reflect a committed signup");
my=(await post({...base,action:"list"})).data;
assert.equal(my.my_bookings.length,1,"Student's class schedule must find their own registration");
assert.equal(my.my_bookings[0].id,bookingId);
const again=await post({...base,action:"book",classId});
assert.equal(again.status,400,"Duplicate signup must be rejected");
assert.equal((await get()).data.sessions[0].booked_count,1);
const cancelled=await post({...base,action:"cancel",bookingId});
assert.equal(cancelled.status,200);
assert.equal((await get()).data.sessions[0].booked_count,0);
assert.equal((await post({...base,action:"list"})).data.my_bookings.length,0);
assert.equal((await post({...base,action:"list",phone_last4:"1"})).status,400);
const ui=readFileSync(new URL("../app/regular/StudentExtraClasses.tsx",import.meta.url),"utf8");
const calendar=readFileSync(new URL("../app/regular/page.tsx",import.meta.url),"utf8");
assert.match(ui,/setMyClubBookings\(prev=>prev\.some/);
assert.match(ui,/booked_count:Math\.min\(c\.capacity,c\.booked_count\+1\)/);
assert.match(ui,/upcomingBooked/);
assert.match(calendar,/upcomingExtraBookings = extras\.upcomingBooked/);
assert.match(calendar,/upcomingBookings\.length \+ upcomingExtraBookings\.length/);
assert.match(calendar,/extras\.send\(entry\)/);
console.log("Freewriting: 0/5 -> 1/5 -> cancellation, visible own schedule, no duplicate pass charge (mock data).");
