import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");

const policyCode = readFileSync(new URL("../lib/passPolicy.ts", import.meta.url), "utf8");
const policyContext = { exports: {}, Date, Intl, Number };
vm.runInNewContext(ts.transpileModule(policyCode, {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText, policyContext);
const p = policyContext.exports;

assert.equal(p.PASS_POLICY_START_DATE_KEY, "2026-07-01");
assert.equal(p.PASS_VALID_DAYS, 70);
assert.equal(p.shouldApplyRegularPassPolicy({pass_registered_at:"2026-06-30"}),false);
assert.equal(p.shouldApplyRegularPassPolicy({pass_registered_at:"2026-07-04"}),true);
assert.equal(p.calculatePassExpirationDateKey("2026-07-10"),"2026-09-18");
assert.equal(p.calculatePassExpirationDateKey("2026-07-31"),"2026-10-09");
assert.equal(p.calculatePassExpirationDateKey("2026-11-05"),"2027-01-14");
const currentPass = {
  pass_registered_at:"2026-11-02",pass_first_lesson_at:"2026-11-05",
  pass_expires_at:"2027-01-14"
};
assert.equal(p.getRegularPassPolicyStatus(currentPass,"2026-11-02").daysLeft,73);
assert.equal(p.canBookWithRegularPassPolicy(currentPass,"2027-01-14T06:00:00Z").ok,true);
assert.equal(p.canBookWithRegularPassPolicy(currentPass,"2027-01-15T06:00:00Z").ok,false);
const waiting = {pass_registered_at:"2026-09-04",pass_first_lesson_at:null,pass_expires_at:null};
assert.equal(p.getRegularPassPolicyStatus(waiting,"2026-11-02").label,"첫 수업일 대기");
assert.equal(p.canBookWithRegularPassPolicy(waiting,"2026-11-07T06:00:00Z").ok,true);

const sql = readFileSync(new URL("../supabase/migrations/20261102_renewal_pass_window_manual_status.sql",import.meta.url),"utf8");
assert.match(sql,/p_type='renewal' and p_date >= '2026-07-01'/);
assert.match(sql,/pass_first_lesson_at=v_first_lesson/);
assert.match(sql,/v_first_lesson\+70/);
assert.match(sql,/pass_extension_until=null/);
assert.match(sql,/manual_enrollment_status/);
assert.match(sql,/from public.regular_bookings b/);
assert.match(sql,/in \('booked','done','change_request','cancel_request'\)/);
console.log("Renewal validity: July boundary, ten-week dates, waiting period, booking eligibility and SQL policy checks passed.");

const routeCode=readFileSync(new URL("../app/api/admin/students/status/route.ts",import.meta.url),"utf8");
let writes=[];
const supabase = {
  from(table) {
    assert.equal(table,"students");
    return {update(value) {
      return {eq(field,studentId) {
        assert.equal(field,"id");
        return {select() {return {async maybeSingle() {
          writes.push({studentId,...value});
          return {data:{id:studentId,...value},error:null};
        }};}};
      }}; }};
  }
};
const routeContext={exports:{},Request,Date,require(name) {
  if(name==="next/server") return {NextResponse:{json:(data,options={})=>({status:options.status||200,data})}};
  if(name.endsWith("/admin"))return{checkAdminPassword:pass=>pass==="test-pass",getAdminPasswordErrorMessage:()=>"no"};
  if(name.endsWith("/supabaseAdmin"))return{getSupabaseAdmin:()=>supabase};
  if(name.endsWith("/supabaseCompat"))return{getErrorMessage:e=>String(e)};
  throw Error(name);
}};
vm.runInNewContext(ts.transpileModule(routeCode,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,routeContext);
const studentId="00000000-0000-0000-0000-000000000001";
const post=(data)=>routeContext.exports.POST(new Request("http://localhost/api/admin/students/status",
  {method:"POST",body:JSON.stringify(data)}));
const base={student_id:studentId,password:"test-pass"};
assert.equal((await post({...base,status:"paused"})).status,200);
assert.equal(writes.at(-1).manual_enrollment_status,"paused");
assert.equal(writes.at(-1).is_active,true);
assert.equal((await post({...base,status:"withdrawn"})).status,200);
assert.equal(writes.at(-1).is_active,false);
assert.equal((await post({...base,status:"active"})).status,200);
assert.equal(writes.at(-1).manual_enrollment_status,"active");
assert.equal((await post({...base,status:"auto"})).status,200);
assert.equal(writes.at(-1).manual_enrollment_status,null);
assert.equal((await post({...base,status:"bad"})).status,400);
assert.equal((await post({...base,password:"wrong",status:"active"})).status,401);
assert.equal(writes.length,4);
console.log("Manual enrollment: admin authorization, four transitions and invalid input checks passed.");
