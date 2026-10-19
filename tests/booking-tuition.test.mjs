import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../lib/bookingTuition.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} };
vm.runInNewContext(js, context);
const { defaultBookingTuition: fee, validTuitionAmount: valid } = context.exports;
assert.equal(fee(90,90),65000);
assert.equal(fee(45,45),40000);
assert.equal(fee(90,45),32500);
for (const [student,lesson] of [[120,120],[45,90],[90,120],[null,45],[90,44.5],[90,0]]) assert.equal(fee(student,lesson),null);
for (const value of [null,0,32500,40000,65000,2147483647]) assert.equal(valid(value),true);
for (const value of [-1,1.5,NaN,Infinity,'65000',undefined,2147483648]) assert.equal(valid(value),false);
console.log('Booking tuition: 22 price and validation assertions passed');

const routeSource = readFileSync(new URL('../app/api/admin/booking-tuition/route.ts', import.meta.url), 'utf8');
let touched = false;
let mockRow = { booking_id: '00000000-0000-0000-0000-000000000001', amount_krw: 65000, confirmed_at: null, memo: '', updated_at: '2026-10-19T03:00:00Z' };
let conflict = false;
let changes;
const query = {
  select() { return this; }, eq() { return this; },
  update(value) { changes = value; return this; },
  async maybeSingle() { return { data: conflict ? null : (changes ? { ...mockRow, ...changes } : mockRow), error: null }; },
};
const routeContext = { exports: {}, Date, Request, require(name) {
  if (name === 'next/server') return { NextResponse: { json: (data, options = {}) => ({ status: options.status || 200, data }) } };
  if (name.endsWith('/admin')) return { checkAdminPassword: value => value === 'test-only', getAdminPasswordErrorMessage: () => 'denied' };
  if (name.endsWith('/supabaseAdmin')) return { getSupabaseAdmin: () => { touched = true; return { from: () => query }; } };
  if (name.endsWith('/bookingTuition')) return context.exports;
  throw new Error(name);
} };
vm.runInNewContext(ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, routeContext);
const post = (body) => routeContext.exports.POST(new Request('http://localhost/test', { method: 'POST', body: JSON.stringify(body) }));
assert.equal((await post({ password: 'wrong' })).status,401);
assert.equal(touched,false);
const input = { password:'test-only',booking_id:mockRow.booking_id,action:'load' };
assert.equal((await post({...input,booking_id:'invalid'})).status,400);
assert.equal((await post(input)).data.tuition.amount_krw,65000);
const save = {...input,action:'save',amount_krw:12345,confirmed:true,memo:'manual',updated_at:mockRow.updated_at};
for (const change of [{amount_krw:-1},{amount_krw:1.5},{amount_krw:null},{confirmed:'yes'},{memo:'x'.repeat(1001)}]) {
  assert.equal((await post({...save,...change})).status,400);
}
const result=await post(save);
assert.equal(result.status,200);
assert.equal(result.data.tuition.amount_krw,12345);
assert.ok(result.data.tuition.confirmed_at);
mockRow=result.data.tuition; changes=undefined;
assert.equal((await post(input)).data.tuition.amount_krw,12345);
conflict=true;
// The initial read also sees no row in this mock, so test missing-record safety.
assert.equal((await post(input)).status,404);
console.log('Booking tuition API: auth, validation, manual save/reload and missing-record checks passed (mock database)');
