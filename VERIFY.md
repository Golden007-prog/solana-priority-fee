# Verification log

Date: 2026-11-17. Machine: Windows 11, Node v24.15.0. RPC for live checks: `https://api.mainnet-beta.solana.com` only.

## Sources checked

| claim | source |
|---|---|
| Instruction layout: `2` + u32 LE (SetComputeUnitLimit), `3` + u64 LE (SetComputeUnitPrice) | `anza-xyz/solana-sdk` `compute-budget-interface/src/lib.rs`: enum order `Unused, RequestHeapFrame(u32), SetComputeUnitLimit(u32), SetComputeUnitPrice(u64), SetLoadedAccountsDataSizeLimit(u32)`; `to_instruction!` macro writes discriminator byte then `to_le_bytes()`; its test: `set_compute_unit_limit(257) == [2,1,1,0,0]`, `set_compute_unit_price(u64::MAX) == [3,255×8]`. Both vectors are in `test/fee.test.js`. |
| Program id `ComputeBudget111111111111111111111111111111` | `anza-xyz/solana-sdk` `sdk-ids/src/lib.rs` |
| Fee = ceil(price × limit / 1e6), saturating | `anza-xyz/agave` `compute-budget/src/compute_budget_limits.rs` `get_prioritization_fee` |
| Per-slot value = max(block min CU price, each listed account's min write-lock price); vote txs excluded; cache of 150 blocks | `anza-xyz/agave` `runtime/src/prioritization_fee_cache.rs` (`get_prioritization_fees`, `MAX_NUM_RECENT_BLOCKS = 150`) and `runtime/src/prioritization_fee.rs` |
| Max 128 addresses; response fields `slot`, `prioritizationFee` | solana.com docs `rpc/http/getrecentprioritizationfees` (source mdx in `solana-foundation/solana-com`) |

## Offline

```
> npm test
✔ compute budget data matches the official interface's own test vectors
✔ toInstructionsData returns the program id and both instructions
✔ bad instruction inputs throw
✔ costLamports rounds up like the runtime and keeps bigints exact
✔ percentile is nearest-rank over observed values
✔ summarizeFees on the captured Raydium SOL-USDC fixture
✔ all-zero window (the unfiltered global fixture) gives zeros, not NaN
✔ levels are configurable and validated
✔ estimatePriorityFee sends the accounts as one array param and sorts samples by slot
✔ no accounts means no params
✔ bad accounts are refused before any request
✔ RPC errors, HTTP errors and timeouts become RpcError subclasses without the URL's key
✔ watch polls one at a time and stops
✔ CLI --help runs offline
﹣ live public RPC (LIVE=1 only) # SKIP
ℹ tests 15  pass 14  fail 0  skipped 1
```

Fixtures in `test/fixtures/` are unmodified responses from the public RPC captured on 2026-11-17 (2 calls):
`recent-fees-global.json` (no accounts: 150 slots, all zero) and `recent-fees-raydium-sol-usdc.json`
(account `58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2`: 150 slots, 125 non-zero, max 166,666).

`index.d.ts` type-checked with TypeScript (`tsc --noEmit --strict`, module nodenext) against a usage file calling every
export; exit 0. No typecheck script is shipped (it would need a dev dependency).

README CLI output and library snippet were replayed offline against `recent-fees-raydium-sol-usdc.json` by replacing
`globalThis.fetch` (output in the README is exactly that). The library snippet printed:

```
{ min: 0, p25: 10000, p50: 10000, p75: 10000, p90: 10000, p95: 10000, max: 166666 } 10000 0.8333
ComputeBudget111111111111111111111111111111 [ 2, 64, 13, 3, 0 ] [ 3, 16, 39, 0, 0, 0, 0, 0, 0 ]
2000
```

`node examples/instructions.js` (offline):

```
program id:           ComputeBudget111111111111111111111111111111
SetComputeUnitLimit:  02f0490200
SetComputeUnitPrice:  03a861000000000000
priority fee:         3750 lamports
```

`node bin/cli.js --bogus` prints help, `unknown option: --bogus`, exit 1.

## Live (public mainnet RPC, 4 calls, sequential, 2 s apart)

`node bin/cli.js 58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2` (before a column-width fix to the level table; numbers unchanged):

```
150 slots (470679963-470680112), 1 account; 66.7% of slots had a non-zero fee
  percentile   micro-lamports/CU
  min 0 · p25 0 · p50 10,000 · p75 10,000 · p90 10,000 · p95 10,000 · max 1,000,000
  low (p25) 0 · medium (p50) 10,000 → 2,000 lamports · high 10,000 · veryHigh 10,000 · unsafeMax 1,000,000 → 200,000 lamports
exit 0
```

`node examples/estimate.js`:

```
150 slots, 73.3% with a non-zero fee
percentiles (micro-lamports/CU): { min: 0, p25: 0, p50: 10000, p75: 10000, p90: 10000, p95: 10000, max: 1000000 }
recommended: { low: 0, medium: 10000, high: 10000, veryHigh: 10000, unsafeMax: 1000000 }
"high" for a 200,000 CU swap costs 2000 lamports on top of the base fee
```

`node examples/watch.js`:

```
slot 470680137: medium 10000 micro-lamports/CU, 76% of slots non-zero
slot 470680163: medium 10000 micro-lamports/CU, 85% of slots non-zero
```

## Not verified

- Node 20 was not run (only Node 24). The code uses only `fetch`, `AbortSignal.timeout`, `DataView.setBigUint64`; the test file uses `t.mock.timers` (Node 20.4+).
- Bytes were checked against the interface's source and its test vectors, not by building a transaction with `@solana/web3.js` and sending it (nothing was signed or sent).
- `--watch` in the CLI was not run live (the library `watch` was, via the example). `--json` was run only offline against the fixture (valid JSON, same fields as the library result).
- No keyed or paid RPC was tested; no comparison with Helius' `getPriorityFeeEstimate` was made.
- Whether a given level actually gets a transaction landed was not measured.

## Known limitations

See README "Limitations": per-block minimums, one node's view, ~1 minute window, base fee and Jito tips not included.

## Integrations, Pages site and guide snippets (2026-11-17, second pass)

Windows 11, Node v24.15.0, public mainnet RPC only, one call at a time with 2-3 s gaps. Nothing was signed or sent.

### `npm test`

```
ℹ tests 19
ℹ pass 18
ℹ fail 0
ℹ skipped 1      (the LIVE=1 test)
```

`test/integrations.test.js` (4 tests, offline): the HTTP endpoint against the Raydium fixture (JSON shape, `costLamports`, CORS header, second request served from cache, 400 for a bad address and for `cu=2000000`, 404, `/health`), RPC failure → 502 and not cached, Discord message shape within Discord's embed limits, and `postWebhook` against a local server that answers 429 once then 204 (one retry, JSON body intact).

### HTTP endpoint, live

```
$ PORT=8799 node examples/integrations/http-endpoint/server.js
fee API on http://127.0.0.1:8799/fee?accounts=<address>  (Ctrl+C to stop)

$ curl "http://127.0.0.1:8799/fee?accounts=58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"
{"accounts":["58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"],"unit":"microLamportsPerComputeUnit","slots":150,"firstSlot":470719179,"lastSlot":470719328,"samplesUsed":150,"ignoreZero":false,"nonZeroShare":0.7267,"percentiles":{"min":0,"p25":0,"p50":10000,"p75":10000,"p90":10000,"p95":10000,"max":1000000},"levels":{...},"recommended":{"low":0,"medium":10000,"high":10000,"veryHigh":10000,"unsafeMax":1000000},"computeUnitLimit":200000,"costLamports":{"low":0,"medium":2000,"high":2000,"veryHigh":2000,"unsafeMax":200000},"baseFeeLamportsPerSignature":5000}
HTTP 200 0.226s
cached repeat: HTTP 200 0.002s
/fee?accounts=bad -> {"error":"not a Solana address: bad"} HTTP 400
/health -> {"ok":true} HTTP 200
```

### Discord alert, live estimate

- `DRY_RUN=1 ONCE=1 node examples/integrations/discord-alert/alert.js` printed the payload: title `Solana priority fee now: 10,000 micro-lamports/CU`, 3 fields (`10,000 / 10,000 / 10,000`, `2,000 lamports + 5,000 base`, `73%`).
- `ONCE=1 DISCORD_WEBHOOK_URL=http://127.0.0.1:8798/api/webhooks/123/token ...` against a local mock webhook: `mock webhook got POST /api/webhooks/123/token application/json: username=Solana fee alert, embeds=1, ...` and the script printed `posted (204): ...`.
- No `DISCORD_WEBHOOK_URL` and no `DRY_RUN`: exits 1 with a message saying what to set.
- Watch mode (`INTERVAL_SEC=5 THRESHOLD=5000`) ran for 12 s: printed `watching 58oQ...YQo2 every 5s: alert when high >= 5,000`; fees stayed on one side of the threshold, so (correctly) nothing was posted.
- **Not verified:** posting to a real Discord webhook (none available here). The payload uses Discord's documented webhook fields (`username`, `embeds[].title/description/color/fields/footer/timestamp`) within their size limits.

### Guide snippets (`docs/*.html`), run as printed

Run in a temp project with `@solana/web3.js@1.99.0`, `@solana/kit@8.6.0`, `@solana-program/compute-budget@0.20.0` and `npm install github:blixvip/solana-priority-fee` (the repo itself still has no dependencies):

| Snippet | Output |
|---|---|
| web3.js: estimate, add both Compute Budget instructions, `getFeeForMessage` | `price 10000 micro-lamports/CU, total fee 7000 lamports` (5,000 base + 2,000 priority, as the formula says) |
| @solana/kit with `@solana-program/compute-budget` | `2 instructions; price 10000 micro-lamports/CU` |
| raw bytes with `toInstructionsData(10_000, 200_000)` | `ComputeBudget111111111111111111111111111111`, `02400d0300`, `031027000000000000` |
| (extra check) our bytes vs web3.js `ComputeBudgetProgram` for the same values | `limit equal: true price equal: true` |
| plain `fetch` of `getRecentPrioritizationFees` | `150 slots; p50 10000, p75 10000, p95 1000000 micro-lamports/CU` |
| landing-page library snippet | `10000 2000 2` (price, lamports, instruction count) |
| `npx github:blixvip/solana-priority-fee <pool>` | 150 slots, table printed |

The CLI readings quoted on the pages (pool: p50 3,227 / p75 10,000 / max 1,000,000, 59.3% non-zero; unscoped: all 150 slots zero) are real output from 2026-11-17 23:30 UTC.
