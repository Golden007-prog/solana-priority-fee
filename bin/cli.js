#!/usr/bin/env node
// solana-priority-fee [account...] [--json] [--ignore-zero] [--cu <units>] [--rpc <url>] [--watch <seconds>]
import { estimatePriorityFee, watch, costLamports, PUBLIC_RPC } from "../src/index.js";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const value = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const json = flag("--json"), ignoreZero = flag("--ignore-zero"), help = flag("-h") || flag("--help");
const rpcUrl = value("--rpc") || process.env.SOLANA_RPC_URL || PUBLIC_RPC;
const cu = Number(value("--cu") ?? 200_000);
const watchSec = value("--watch");
const unknown = args.find((a) => a.startsWith("-"));

if (help || unknown) {
  console.log(`solana-priority-fee: what compute-unit price recent Solana blocks landed at

  solana-priority-fee                    all recent slots, no account filter
  solana-priority-fee <account> ...      scoped to writable accounts your tx will lock (a pool, a bonding curve; max 128)
  --ignore-zero                          leave zero-fee slots out of the percentiles
  --cu <units>                           compute-unit limit used for the lamport cost column (default 200000)
  --watch <seconds>                      re-estimate every N seconds (min 1), Ctrl+C to stop
  --json                                 the raw result
  --rpc <url> or SOLANA_RPC_URL          your RPC (default: the public mainnet one)

  Prices are micro-lamports per compute unit. Made by Blix: https://blixvip.com   Discord: https://discord.gg/grokbot`);
  if (unknown) console.error(`\nunknown option: ${unknown}`);
  process.exit(unknown ? 1 : 0);
}
if (!(Number.isInteger(cu) && cu >= 0)) { console.error("--cu must be a whole number"); process.exit(1); }

const options = { accounts: args, rpcUrl, ignoreZero };
const fmt = (n) => n.toLocaleString("en-US");

function print(r) {
  if (json) { console.log(JSON.stringify(r, null, 2)); return; }
  const scope = r.accounts.length ? `${r.accounts.length} account${r.accounts.length > 1 ? "s" : ""}` : "no account filter";
  console.log(`${r.slots} slots (${r.firstSlot}-${r.lastSlot}), ${scope}; ${(r.nonZeroShare * 100).toFixed(1)}% of slots had a non-zero fee${r.ignoreZero ? `; zero-fee slots ignored (${r.samplesUsed} used)` : ""}`);
  console.log("\n  percentile         micro-lamports/CU");
  for (const [k, v] of Object.entries(r.percentiles)) console.log(`  ${k.padEnd(16)} ${fmt(v).padStart(18)}`);
  console.log(`\n  level              micro-lamports/CU   cost at ${fmt(cu)} CU`);
  for (const [k, v] of Object.entries(r.recommended)) console.log(`  ${`${k} (p${r.levels[k]})`.padEnd(16)} ${fmt(v).padStart(18)}   ${fmt(costLamports(v, cu)).padStart(10)} lamports`);
  console.log("\n  cost excludes the 5,000 lamport base fee per signature.");
}

try {
  if (watchSec != null) {
    const s = Number(watchSec);
    if (!(s >= 1)) { console.error("--watch needs a number of seconds, at least 1"); process.exit(1); }
    watch(s * 1000, (err, r) => { if (err) console.error(err.message); else { if (!json) console.log(`\n--- ${new Date().toISOString()}`); print(r); } }, options);
  } else {
    print(await estimatePriorityFee(options));
  }
} catch (e) { console.error(e.message); process.exit(1); }
