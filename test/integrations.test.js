// Offline tests for examples/integrations: the HTTP fee endpoint and the Discord webhook alert.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createFeeHandler } from "../examples/integrations/http-endpoint/server.js";
import { buildMessage, postWebhook, stateFor } from "../examples/integrations/discord-alert/alert.js";
import { estimatePriorityFee } from "../src/index.js";

const body = JSON.parse(readFileSync(new URL("./fixtures/recent-fees-raydium-sol-usdc.json", import.meta.url), "utf8"));
const POOL = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2";
const rpcFetch = (calls) => async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => body }; };

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test("http endpoint: /fee answers JSON with levels and lamport cost, cached", async (t) => {
  const calls = [];
  const { server, base } = await listen(createFeeHandler({ fetch: rpcFetch(calls), rpcUrl: "http://rpc.invalid", cacheMs: 60_000 }));
  t.after(() => server.close());

  const res = await fetch(`${base}/fee?accounts=${POOL}&cu=300000`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  const r = await res.json();
  assert.deepEqual(r.accounts, [POOL]);
  assert.equal(r.slots, 150);
  assert.equal(r.computeUnitLimit, 300000);
  assert.equal(r.costLamports.high, Math.ceil((r.recommended.high * 300000) / 1e6));
  assert.deepEqual(calls[0].params, [[POOL]]);

  await fetch(`${base}/fee?accounts=${POOL}`);
  assert.equal(calls.length, 1, "second request within cacheMs is served from cache");

  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/nope`)).status, 404);
  assert.equal((await fetch(`${base}/fee?accounts=not-an-address`)).status, 400);
  assert.equal((await fetch(`${base}/fee?cu=2000000`)).status, 400);
});

test("http endpoint: RPC failure is a 502 and is not cached", async (t) => {
  let n = 0;
  const failing = async () => { n++; return { ok: false, status: 503, json: async () => ({}) }; };
  const { server, base } = await listen(createFeeHandler({ fetch: failing, rpcUrl: "http://rpc.invalid" }));
  t.after(() => server.close());
  assert.equal((await fetch(`${base}/fee`)).status, 502);
  assert.equal((await fetch(`${base}/fee`)).status, 502);
  assert.ok(n >= 2, "a failure is retried on the next request");
});

test("discord alert: state and message", async () => {
  assert.equal(stateFor(100, 100), "high");
  assert.equal(stateFor(99, 100), "normal");
  const est = await estimatePriorityFee({ accounts: [POOL], fetch: rpcFetch([]), rpcUrl: "http://rpc.invalid" });
  const m = buildMessage(est, { level: "high", threshold: 5000, kind: "high" });
  assert.equal(m.embeds.length, 1);
  const e = m.embeds[0];
  assert.match(e.title, /are up: 10,000 micro-lamports\/CU/);
  assert.ok(e.title.length <= 256 && e.fields.length <= 25 && e.fields.every((f) => f.value.length <= 1024));
  assert.match(e.description, /58oQ\.\.\.YQo2/);
  assert.equal(e.fields[1].value, "2,000 lamports + 5,000 base");
  assert.match(buildMessage(est, { threshold: 1, kind: "normal" }).embeds[0].title, /back down/);
});

test("discord alert: postWebhook sends JSON and retries once on 429", async (t) => {
  const got = [];
  let first = true;
  const { server, base } = await listen((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      got.push({ method: req.method, type: req.headers["content-type"], body: JSON.parse(data) });
      if (first) { first = false; res.writeHead(429, { "content-type": "application/json" }); return res.end(JSON.stringify({ retry_after: 0.05 })); }
      res.writeHead(204); res.end();
    });
  });
  t.after(() => server.close());
  const status = await postWebhook(`${base}/api/webhooks/1/abc`, { content: "hi" });
  assert.equal(status, 204);
  assert.equal(got.length, 2);
  assert.deepEqual(got[1], { method: "POST", type: "application/json", body: { content: "hi" } });
});
