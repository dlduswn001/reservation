import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const routeSource = readFileSync(new URL("../app/admin/admin.webmanifest/route.ts", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("../app/admin/layout.tsx", import.meta.url), "utf8");
const originalManifest = readFileSync(new URL("../app/manifest.webmanifest/route.ts", import.meta.url), "utf8");

function transpile(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
}

const manifestContext = {
  exports: {},
  require(name) {
    if (name === "next/server") {
      return {
        NextResponse: {
          json: (body, options) => ({ body, headers: options.headers }),
        },
      };
    }
    throw new Error(name);
  },
};
vm.runInNewContext(transpile(routeSource), manifestContext);
const result = manifestContext.exports.GET();
assert.equal(result.body.id, "/admin");
assert.equal(result.body.start_url, "/admin");
assert.equal(result.body.scope, "/admin");
assert.equal(result.body.display, "standalone");
assert.equal(result.body.name, "문장학교 관리자");
assert.equal(result.headers["Content-Type"], "application/manifest+json; charset=utf-8");
assert.ok(result.body.shortcuts.some(link => link.url === "/admin/studio"));
assert.ok(result.body.icons.some(icon => icon.sizes === "192x192"));
assert.ok(result.body.icons.some(icon => icon.sizes === "512x512"));
assert.ok(originalManifest.includes('start_url: "/"'));
assert.ok(originalManifest.includes('scope: "/"'));
assert.ok(originalManifest.includes('name: "문장학교"'));
const publicContext = { exports: {}, require: manifestContext.require };
vm.runInNewContext(transpile(originalManifest), publicContext);
const studentManifest = publicContext.exports.GET();
assert.equal(studentManifest.body.id, "/");
assert.equal(studentManifest.body.start_url, "/");
assert.equal(studentManifest.body.scope, "/");
assert.equal(studentManifest.body.name, "문장학교");
assert.equal(studentManifest.headers["Content-Type"], "application/manifest+json; charset=utf-8");

const layoutContext = { exports: {}, require(name) {
  if (name === "react/jsx-runtime") return { jsx: () => ({}) };
  throw new Error(name);
} };
vm.runInNewContext(transpile(layoutSource), layoutContext);
assert.equal(layoutContext.exports.metadata.manifest, "/admin/admin.webmanifest");
assert.equal(layoutContext.exports.metadata.appleWebApp.title, "문장학교 관리자");
console.log("Independent admin PWA metadata and launch-route checks passed");
