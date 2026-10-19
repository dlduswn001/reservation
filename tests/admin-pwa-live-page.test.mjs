import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 34171;
const host = `http://127.0.0.1:${port}`;
const worker = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  env: { ...process.env, HOSTNAME: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let startupLog = "";
worker.stdout.on("data", chunk => { startupLog += String(chunk).slice(-2000); });
worker.stderr.on("data", chunk => { startupLog += String(chunk).slice(-2000); });

async function get(path) {
  return fetch(host + path, { headers: { Accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(5000) });
}
async function waitReady() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await get("/admin");
      if (res.status === 200) return;
      if (res.status >= 300 && res.status < 500) throw Error(`Admin HTTP ${res.status}`);
    } catch (error) {
      if (i === 29) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error("Next server not ready: " + startupLog);
}

function manifestLinks(html) {
  const head = html.split("</head>")[0] || html;
  return [...head.matchAll(/<link\b[^>]*\brel=["']manifest["'][^>]*>/gi)]
    .map(entry => /\bhref=["']([^"']+)["']/.exec(entry[0])?.[1])
    .filter(Boolean);
}
try {
  await waitReady();
  for (const path of ["/admin", "/admin/studio"]) {
    const response = await get(path);
    assert.equal(response.status, 200, `Admin route ${path} must load`);
    const manifests = manifestLinks(await response.text());
    assert.deepEqual(manifests, ["/admin/admin.webmanifest"],
      `Admin route ${path} must have ONLY the admin install manifest, got ${manifests.join(", ")}`);
  }
  const root = await get("/");
  const rootManifest = manifestLinks(await root.text());
  assert.deepEqual(rootManifest, ["/manifest.webmanifest"],
    `Student homepage must retain the public manifest, got ${rootManifest.join(", ")}`);
  const admin = await fetch(host + "/admin/admin.webmanifest");
  assert.equal(admin.status, 200);
  const data = await admin.json();
  assert.equal(data.id, "/admin");
  assert.equal(data.start_url, "/admin");
  assert.equal(data.scope, "/admin");
  console.log("Installed admin app starts at /admin; distinct public PWA unaffected.");
} finally {
  worker.kill("SIGTERM");
}
