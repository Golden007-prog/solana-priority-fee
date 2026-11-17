// solana-priority-fee: what compute-unit price recent Solana blocks have been landing at, from any RPC's
// getRecentPrioritizationFees, plus the ComputeBudget instruction bytes to pay it. No dependencies. Node 20+.
//
// A small, open piece of what runs behind Blix (https://blixvip.com), the Solana memecoin terminal.
import { rpc, PUBLIC_RPC, RpcError, RpcTimeoutError } from "./rpc.js";

export { PUBLIC_RPC, RpcError, RpcTimeoutError };
export { costLamports, toInstructionsData, setComputeUnitLimitData, setComputeUnitPriceData, COMPUTE_BUDGET_PROGRAM_ID, MAX_COMPUTE_UNIT_LIMIT } from "./compute-budget.js";

/** The RPC method accepts at most this many accounts. */
export const MAX_ACCOUNTS = 128;

/** Named levels and the percentile each one is read from. Override any of them with `levels`. */
export const DEFAULT_LEVELS = Object.freeze({ low: 25, medium: 50, high: 75, veryHigh: 95, unsafeMax: 100 });

const PERCENTILES = { min: 0, p25: 25, p50: 50, p75: 75, p90: 90, p95: 95, max: 100 };
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// A Solana address is base58 for exactly 32 bytes.
function isAddress(text) {
  if (typeof text !== "string" || !B58.test(text)) return false;
  let n = 0n;
  for (const ch of text) n = n * 58n + BigInt(ALPHABET.indexOf(ch));
  let bytes = 0;
  while (n > 0n) { bytes++; n >>= 8n; }
  for (const ch of text) { if (ch !== "1") break; bytes++; }
  return bytes === 32;
}

function checkAccounts(accounts) {
  if (accounts == null) return [];
  if (!Array.isArray(accounts)) throw new TypeError("accounts must be an array of base58 addresses");
  const list = [...new Set(accounts)];
  for (const a of list) if (!isAddress(a)) throw new TypeError(`not a Solana address: ${String(a).slice(0, 48)}`);
  if (list.length > MAX_ACCOUNTS) throw new RangeError(`getRecentPrioritizationFees takes at most ${MAX_ACCOUNTS} accounts, got ${list.length}`);
  return list;
}

/**
 * The value at percentile p (0..100) of an ascending list, nearest-rank: always a fee that was actually observed.
 * @param {number[]} sorted ascending
 * @param {number} p
 */
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  if (!(p >= 0 && p <= 100)) throw new RangeError(`percentile must be between 0 and 100, got ${p}`);
  if (p === 0) return sorted[0];
  return sorted[Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length))) - 1];
}

/**
 * Raw samples: one { slot, fee } per recent slot the node has cached (up to 150), oldest first.
 * @param {string[]} [accounts]  writable accounts your transaction will lock (max 128)
 * @param {{ rpcUrl?: string, fetch?: typeof fetch, timeoutMs?: number }} [options]
 */
export async function getRecentFees(accounts = [], { rpcUrl = process.env.SOLANA_RPC_URL || PUBLIC_RPC, ...net } = {}) {
  const list = checkAccounts(accounts);
  const result = await rpc(rpcUrl, "getRecentPrioritizationFees", list.length ? [list] : [], net);
  if (!Array.isArray(result)) throw new RpcError("getRecentPrioritizationFees did not return a list", { method: "getRecentPrioritizationFees" });
  return result
    .map((r) => ({ slot: Number(r.slot), fee: Number(r.prioritizationFee) }))
    .filter((r) => Number.isFinite(r.slot) && Number.isFinite(r.fee))
    .sort((a, b) => a.slot - b.slot);
}

/**
 * Turn samples into percentiles and a price per level. Pure: no network.
 * @param {{ slot: number, fee: number }[]} samples
 * @param {{ ignoreZero?: boolean, levels?: Record<string, number> }} [options]
 */
export function summarizeFees(samples, { ignoreZero = false, levels = {} } = {}) {
  const map = { ...DEFAULT_LEVELS, ...levels };
  for (const [name, p] of Object.entries(map)) if (!(typeof p === "number" && p >= 0 && p <= 100)) throw new RangeError(`level ${name} must map to a percentile between 0 and 100, got ${p}`);
  const all = samples.map((s) => s.fee);
  const nonZero = all.filter((f) => f > 0).length;
  const used = (ignoreZero ? all.filter((f) => f > 0) : all).sort((a, b) => a - b);
  const percentiles = Object.fromEntries(Object.entries(PERCENTILES).map(([k, p]) => [k, percentile(used, p)]));
  const recommended = Object.fromEntries(Object.entries(map).map(([k, p]) => [k, percentile(used, p)]));
  const slots = samples.map((s) => s.slot);
  return {
    unit: "microLamportsPerComputeUnit",
    slots: samples.length,
    firstSlot: slots.length ? Math.min(...slots) : null,
    lastSlot: slots.length ? Math.max(...slots) : null,
    samplesUsed: used.length,
    ignoreZero,
    nonZeroShare: all.length ? +(nonZero / all.length).toFixed(4) : 0,
    percentiles,
    levels: map,
    recommended,
  };
}

/**
 * Estimate a priority fee from the RPC's recent per-slot fees.
 * @param {{ accounts?: string[], rpcUrl?: string, ignoreZero?: boolean, levels?: Record<string, number>, fetch?: typeof fetch, timeoutMs?: number }} [options]
 */
export async function estimatePriorityFee({ accounts = [], ignoreZero = false, levels, ...net } = {}) {
  const list = checkAccounts(accounts);
  const samples = await getRecentFees(list, net);
  return { accounts: list, ...summarizeFees(samples, { ignoreZero, levels }) };
}

/**
 * Re-estimate every intervalMs (at least 1000 ms), one request at a time: the next starts only after the last finished.
 * The callback gets (error, estimate). Returns { stop() }.
 * @param {number} intervalMs
 * @param {(error: Error|null, estimate: object|null) => void} callback
 * @param {Parameters<typeof estimatePriorityFee>[0]} [options]
 */
export function watch(intervalMs, callback, options = {}) {
  if (!(Number.isFinite(intervalMs) && intervalMs >= 1000)) throw new RangeError("intervalMs must be at least 1000: the RPC's fee cache moves one slot (~400 ms) at a time, and polling faster only spends rate limit");
  if (typeof callback !== "function") throw new TypeError("callback must be a function");
  checkAccounts(options.accounts);
  let stopped = false, timer = null;
  const tick = async () => {
    let result = null, error = null;
    try { result = await estimatePriorityFee(options); } catch (e) { error = e; }
    if (stopped) return;
    timer = setTimeout(tick, intervalMs);
    callback(error, result);   // not caught: an exception in your callback should not vanish
  };
  tick();
  return { stop() { stopped = true; clearTimeout(timer); } };
}
