import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  estimatePriorityFee, getRecentFees, summarizeFees, percentile, watch, costLamports, toInstructionsData,
  setComputeUnitLimitData, setComputeUnitPriceData, COMPUTE_BUDGET_PROGRAM_ID, DEFAULT_LEVELS, RpcError, RpcTimeoutError,
} from "../src/index.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const POOL = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2";   // Raydium AMM v4 SOL-USDC, writable on every swap

// A fetch that answers with a fixture body (or a function of the request) and remembers what it was asked.
const fakeFetch = (answer, calls = []) => async (url, init) => {
  const req = JSON.parse(init.body); calls.push({ url, ...req, signal: init.signal });
  const a = typeof answer === "function" ? answer(req) : answer;
  if (a instanceof Error) throw a;
  return { ok: (a.status ?? 200) < 400, status: a.status ?? 200, json: async () => a.body };
};

test("compute budget data matches the official interface's own test vectors", () => {
  // compute-budget-interface: set_compute_unit_limit(257) == [2,1,1,0,0]; set_compute_unit_price(u64::MAX) == [3, 255 x 8]
  assert.deepEqual([...setComputeUnitLimitData(257)], [2, 1, 1, 0, 0]);
  assert.deepEqual([...setComputeUnitPriceData(2n ** 64n - 1n)], [3, 255, 255, 255, 255, 255, 255, 255, 255]);
  assert.deepEqual([...setComputeUnitPriceData(1000)], [3, 0xe8, 0x03, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...setComputeUnitLimitData(200_000)], [2, 0x40, 0x0d, 0x03, 0]);
});

test("toInstructionsData returns the program id and both instructions", () => {
  const r = toInstructionsData(12_345, 300_000);
  assert.equal(r.programId, "ComputeBudget111111111111111111111111111111");
  assert.equal(COMPUTE_BUDGET_PROGRAM_ID, r.programId);
  assert.equal(r.setComputeUnitLimit.length, 5);
  assert.equal(r.setComputeUnitPrice.length, 9);
  assert.equal(new DataView(r.setComputeUnitPrice.buffer).getBigUint64(1, true), 12_345n);
  assert.equal(new DataView(r.setComputeUnitLimit.buffer).getUint32(1, true), 300_000);
  assert.deepEqual(r.instructions.map((i) => [i.programId, i.accounts.length, i.data[0]]), [[r.programId, 0, 2], [r.programId, 0, 3]]);
});

test("bad instruction inputs throw", () => {
  assert.throws(() => setComputeUnitLimitData(2 ** 32), RangeError);
  assert.throws(() => setComputeUnitLimitData(-1), RangeError);
  assert.throws(() => setComputeUnitPriceData(1.5), TypeError);
  assert.throws(() => setComputeUnitPriceData(2n ** 64n), RangeError);
});

test("costLamports rounds up like the runtime and keeps bigints exact", () => {
  assert.equal(costLamports(0, 1_400_000), 0);
  assert.equal(costLamports(999_999, 1), 1, "less than one lamport rounds up to one");
  assert.equal(costLamports(1_000_000, 1), 1);
  assert.equal(costLamports(10_000, 200_000), 2_000);
  assert.equal(costLamports(1, 1_000_001), 2);
  assert.equal(costLamports(2n ** 64n - 1n, 1_400_000n), 2n ** 64n - 1n, "saturates at u64::MAX");
  assert.throws(() => costLamports(2 ** 52, 4_000_000_000), RangeError);
});

test("percentile is nearest-rank over observed values", () => {
  const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.deepEqual([0, 25, 50, 75, 90, 95, 100].map((p) => percentile(s, p)), [1, 3, 5, 8, 9, 10, 10]);
  assert.equal(percentile([], 50), 0);
  assert.throws(() => percentile(s, 101), RangeError);
});

test("summarizeFees on the captured Raydium SOL-USDC fixture", () => {
  const samples = fixture("recent-fees-raydium-sol-usdc.json").result.map((r) => ({ slot: r.slot, fee: r.prioritizationFee }));
  const r = summarizeFees(samples);
  assert.equal(r.slots, 150);
  assert.equal(r.nonZeroShare, +(125 / 150).toFixed(4));
  assert.equal(r.percentiles.p50, 10_000);
  assert.equal(r.percentiles.max, 166_666);
  assert.equal(r.percentiles.min, 0);
  assert.deepEqual(r.levels, { ...DEFAULT_LEVELS });
  assert.equal(r.recommended.medium, r.percentiles.p50);
  assert.equal(r.recommended.unsafeMax, r.percentiles.max);
  const values = Object.values(r.percentiles);
  assert.deepEqual(values, [...values].sort((a, b) => a - b), "percentiles never go down");

  const nz = summarizeFees(samples, { ignoreZero: true });
  assert.equal(nz.samplesUsed, 125);
  assert.ok(nz.percentiles.min > 0);
});

test("all-zero window (the unfiltered global fixture) gives zeros, not NaN", () => {
  const samples = fixture("recent-fees-global.json").result.map((r) => ({ slot: r.slot, fee: r.prioritizationFee }));
  const r = summarizeFees(samples, { ignoreZero: true });
  assert.equal(r.slots, 150);
  assert.equal(r.samplesUsed, 0);
  assert.equal(r.nonZeroShare, 0);
  assert.deepEqual(Object.values(r.recommended), [0, 0, 0, 0, 0]);
});

test("summarizeFees finds bounds across a long unsorted history", () => {
  const length = 300_000;
  const samples = Array.from({ length }, (_, i) => ({ slot: (i + 123_456) % length, fee: i % 5 }));
  const summary = summarizeFees(samples);
  assert.equal(summary.firstSlot, 0);
  assert.equal(summary.lastSlot, length - 1);
  assert.equal(summary.slots, length);
  assert.equal(summary.percentiles.p50, 2);

  const empty = summarizeFees([]);
  assert.equal(empty.firstSlot, null);
  assert.equal(empty.lastSlot, null);
});

test("levels are configurable and validated", () => {
  const r = summarizeFees([{ slot: 1, fee: 10 }, { slot: 2, fee: 20 }, { slot: 3, fee: 30 }, { slot: 4, fee: 40 }], { levels: { medium: 75, turbo: 90 } });
  assert.equal(r.recommended.medium, 30);
  assert.equal(r.recommended.turbo, 40);
  assert.equal(r.recommended.low, 10);
  assert.throws(() => summarizeFees([], { levels: { low: 150 } }), RangeError);
});

test("estimatePriorityFee sends the accounts as one array param and sorts samples by slot", async () => {
  const calls = [];
  const body = fixture("recent-fees-raydium-sol-usdc.json");
  const shuffled = { ...body, result: [...body.result].reverse() };
  const r = await estimatePriorityFee({ accounts: [POOL, POOL], rpcUrl: "https://rpc.example/?api-key=secret", fetch: fakeFetch({ body: shuffled }, calls) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "getRecentPrioritizationFees");
  assert.deepEqual(calls[0].params, [[POOL]], "deduplicated");
  assert.ok(calls[0].signal, "every call has a timeout signal");
  assert.equal(r.firstSlot, body.result[0].slot);
  assert.deepEqual(r.accounts, [POOL]);
});

test("no accounts means no params", async () => {
  const calls = [];
  const samples = await getRecentFees([], { fetch: fakeFetch({ body: fixture("recent-fees-global.json") }, calls) });
  assert.deepEqual(calls[0].params, []);
  assert.equal(samples.length, 150);
  assert.ok(samples.every((s, i) => i === 0 || s.slot > samples[i - 1].slot));
});

test("bad accounts are refused before any request", async () => {
  const fetch = () => { throw new Error("should not be called"); };
  await assert.rejects(getRecentFees(["not-an-address"], { fetch }), TypeError);
  await assert.rejects(getRecentFees(["1111111111111111111111111111111"], { fetch }), TypeError, "31 ones is 31 bytes");
  const many = Array.from({ length: 129 }, (_, i) => randomAddress(i));
  assert.equal(new Set(many).size, 129);
  await assert.rejects(getRecentFees(many, { fetch }), RangeError);
});

// 32 distinct bytes, base58-encoded, so 129 distinct valid addresses exist for the limit test.
function randomAddress(seed) {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (let i = 0; i < 32; i++) n = (n << 8n) | BigInt((seed * 7 + i * 13 + 1) & 255 || 1);
  let s = "";
  while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
  return s;
}

test("RPC errors, HTTP errors and timeouts become RpcError subclasses without the URL's key", async () => {
  const rpcUrl = "https://rpc.example/?api-key=SECRET";
  const e1 = await getRecentFees([], { rpcUrl, fetch: fakeFetch({ body: { error: { code: -32601, message: "Method not found" } } }) }).catch((e) => e);
  assert.ok(e1 instanceof RpcError); assert.equal(e1.code, -32601);
  const e2 = await getRecentFees([], { rpcUrl, fetch: fakeFetch({ status: 429, body: {} }) }).catch((e) => e);
  assert.equal(e2.status, 429); assert.ok(!e2.message.includes("SECRET"));
  const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
  const e3 = await getRecentFees([], { rpcUrl, fetch: fakeFetch(timeout), timeoutMs: 5 }).catch((e) => e);
  assert.ok(e3 instanceof RpcTimeoutError);
  const e4 = await getRecentFees([], { rpcUrl, fetch: fakeFetch(new Error("ECONNREFUSED")) }).catch((e) => e);
  assert.ok(e4 instanceof RpcError); assert.ok(!e4.message.includes("SECRET"));
});

test("watch polls one at a time and stops", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  const fetch = fakeFetch(() => { calls++; return { body: fixture("recent-fees-global.json") }; });
  const seen = [];
  const w = watch(5000, (err, r) => seen.push(err ? "err" : r.slots), { fetch });
  await new Promise((ok) => setImmediate(ok));
  assert.deepEqual(seen, [150]);
  t.mock.timers.tick(5000);
  await new Promise((ok) => setImmediate(ok));
  assert.deepEqual(seen, [150, 150]);
  w.stop();
  t.mock.timers.tick(20000);
  await new Promise((ok) => setImmediate(ok));
  assert.equal(calls, 2);
  assert.throws(() => watch(100, () => {}), RangeError);
});

test("watch summarizes distinct slots from bounded successful windows", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const recorded = fixture("recent-fees-raydium-sol-usdc.json");
  const replies = [
    { body: { ...recorded, result: recorded.result.slice(0, 2) } },
    { body: { ...recorded, result: recorded.result.slice(1, 4) } },
    { status: 429, body: {} },
    { body: { ...recorded, result: recorded.result.slice(2, 5) } },
  ];
  const seen = [];
  const watcher = watch(1000, (error, estimate) => seen.push([error, estimate]), {
    accounts: [POOL],
    historyWindows: 2,
    fetch: fakeFetch(() => replies.shift()),
  });
  t.after(() => watcher.stop());
  for (let poll = 0; poll < 4; poll++) {
    if (poll > 0) t.mock.timers.tick(1000);
    await new Promise((resolve) => setImmediate(resolve));
  }

  const first = seen[0][1];
  assert.equal(first.history.windows, 1);
  assert.equal(first.history.trend, null);
  const second = seen[1][1];
  assert.equal(second.slots, 3);
  assert.equal(second.history.summary.slots, 4);
  assert.equal(second.history.windows, 2);
  assert.equal(second.history.trend, "down");
  assert.equal(seen[2][0].status, 429);
  assert.equal(seen[2][1], null);
  const last = seen[3][1];
  assert.equal(last.history.summary.firstSlot, recorded.result[1].slot);
  assert.equal(last.history.summary.slots, 4);
  assert.equal(last.history.trend, "flat");
});

test("watch rejects an invalid window count before polling", () => {
  const fetch = () => assert.fail("invalid watch history must not send an RPC request");
  for (const historyWindows of [0, 61, 2.5, "2"]) {
    assert.throws(() => {
      const watcher = watch(1000, () => {}, { historyWindows, fetch });
      watcher.stop();
    }, RangeError);
  }
});

test("CLI --help runs offline", () => {
  const r = spawnSync(process.execPath, [new URL("../bin/cli.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "--help"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /micro-lamports per compute unit/);
});

test("live public RPC (LIVE=1 only)", { skip: !process.env.LIVE }, async () => {
  const r = await estimatePriorityFee({ accounts: [POOL], rpcUrl: "https://api.mainnet-beta.solana.com" });
  assert.ok(r.slots > 0);
});
