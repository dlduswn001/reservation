import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../app/api/admin/students/route.ts", import.meta.url), "utf8");
let sentRpc = null;
let rpcCalls = 0;

const fakeClient = {
  async rpc(name, args) {
    assert.equal(name, "munjang_admin_create_student");
    rpcCalls += 1;
    sentRpc = args;
    return { data: "00000000-0000-0000-0000-000000000001", error: null };
  }
};
const context = {
  exports: {},
  Request,
  Number,
  require(name) {
    if (name === "next/server") return {
      NextResponse: { json: (data, options = {}) => ({ status: options.status || 200, data }) }
    };
    if (name.endsWith("/admin")) return {
      checkAdminPassword: value => value === "test-only",
      getAdminPasswordErrorMessage: () => "unauthorized"
    };
    if (name.endsWith("/supabaseAdmin")) return { getSupabaseAdmin: () => fakeClient };
    if (name.endsWith("/businessRules")) return { normalizeLessonDurationMinutes: value => Number(value) };
    if (name.endsWith("/passPolicy")) return {
      cleanDateKey: value => value || null,
      calculatePassExpirationDateKey: () => null
    };
    if (name.endsWith("/supabaseCompat")) return {
      getErrorMessage: error => String(error?.message || error),
      isMissingPassColumnError: () => false
    };
    throw new Error("Unexpected imported module: " + name);
  }
};

const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(js, context);
const post = body => context.exports.POST(new Request("http://localhost/api/admin/students", {
  method: "POST", body: JSON.stringify(body)
}));

const valid = {
  password: "test-only",
  name: "테스트 수강생",
  phone_number: "010-1234-5678",
  phone_last4: "5678",
  paid_amount_krw: 0,
  lesson_credits: 4,
  lesson_duration_minutes: 90,
  pass_registered_at: "2026-10-20"
};

assert.equal((await post(valid)).status, 200, "Valid full phone and matching last four must register");
assert.equal(sentRpc.p_phone_last4, "5678");
assert.equal(sentRpc.p_phone_number, "01012345678");
assert.equal(sentRpc.p_name, "테스트 수강생");
assert.equal((await post({ ...valid, name: "   " })).status, 400);
assert.equal((await post({ ...valid, phone_last4: "567" })).status, 400);
assert.equal((await post({ ...valid, phone_last4: "56A8" })).status, 400);
assert.equal((await post({ ...valid, phone_last4: "0000" })).status, 400);
assert.equal((await post({ ...valid, password: "wrong" })).status, 401);
assert.equal(rpcCalls, 1, "Invalid requests must not call the database");

const onlyFour = await post({ ...valid, phone_number: "", phone_last4: "5678" });
assert.equal(onlyFour.status, 200, "Last-four-only enrolment must remain supported");
assert.equal(sentRpc.p_phone_number, null);
assert.equal(rpcCalls, 2);

console.log("Student registration: valid last four, full phone, invalid input and auth tests passed.");
