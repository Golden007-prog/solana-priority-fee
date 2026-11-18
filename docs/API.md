# API

```js
import {
  estimatePriorityFee, getRecentFees, summarizeFees, percentile, watch,
  costLamports, toInstructionsData, setComputeUnitLimitData, setComputeUnitPriceData,
  COMPUTE_BUDGET_PROGRAM_ID, MAX_COMPUTE_UNIT_LIMIT, MAX_ACCOUNTS, DEFAULT_LEVELS, PUBLIC_RPC,
  RpcError, RpcTimeoutError,
} from "solana-priority-fee";
```

All prices are **micro-lamports per compute unit** (1 lamport = 1,000,000 micro-lamports).

## Network options

Every function that talks to an RPC takes these options:

| option | default | |
|---|---|---|
| `rpcUrl` | `SOLANA_RPC_URL`, else `https://api.mainnet-beta.solana.com` | any Solana JSON-RPC endpoint |
| `timeoutMs` | `10000` | per request, via `AbortSignal.timeout` |
| `fetch` | `globalThis.fetch` | swap in your own (tests, proxies) |

## `estimatePriorityFee(options?) → Promise<FeeEstimate>`

One `getRecentPrioritizationFees` call, summarised.

| option | default | |
|---|---|---|
| `accounts` | `[]` | writable accounts your transaction will lock; at most 128, duplicates dropped |
| `ignoreZero` | `false` | leave zero-fee slots out of the percentiles and levels |
| `levels` | `DEFAULT_LEVELS` | `{ name: percentile }`, merged over the defaults |

Result:

```ts
{
  accounts: string[],
  unit: "microLamportsPerComputeUnit",
  slots: number,              // samples returned (the node caches up to 150 blocks)
  firstSlot, lastSlot,        // range covered
  samplesUsed: number,        // after ignoreZero
  ignoreZero: boolean,
  nonZeroShare: number,       // 0..1, share of slots whose fee was > 0 (always over all slots)
  percentiles: { min, p25, p50, p75, p90, p95, max },
  levels: { low: 25, medium: 50, high: 75, veryHigh: 95, unsafeMax: 100, ...yours },
  recommended: { low, medium, high, veryHigh, unsafeMax, ...yours },   // the price at each level's percentile
}
```

Percentiles are nearest-rank, so every number is a fee that was actually observed. With no samples (for example
`ignoreZero` on an all-zero window) every value is `0`.

## `getRecentFees(accounts?, options?) → Promise<{ slot, fee }[]>`

The raw samples, sorted by slot.

## `summarizeFees(samples, { ignoreZero?, levels? }) → FeeSummary`

Pure: what `estimatePriorityFee` does after the request. Feed it your own samples or a stored history in any order. The slot bounds are `null` when no samples are supplied.

## `percentile(sortedAscending, p) → number`

Nearest-rank percentile, `p` in 0..100. `0` on an empty list.

## `watch(intervalMs, callback, options?) → { stop() }`

Calls `estimatePriorityFee(options)` now and then every `intervalMs` (minimum 1000) after the previous one finished,
so requests never overlap. `callback(error, estimate)`: one of the two is `null`. An exception thrown inside your
callback is not swallowed.

Pass `historyWindows` from 2 to 60 to include a `history` field on each successful estimate. It contains the number of
successful windows retained, a `summary` over their distinct slots (the latest observation wins when windows overlap),
and a `trend` of `up`, `down`, or `flat` based on the change in p50 from the oldest to the newest window. The trend is
`null` until both windows have usable samples. Failed polls do not consume a window. The default value of 1 omits
the history field. The rest of the estimate always describes the latest window.

## `costLamports(price, computeUnits) → number | bigint`

The priority fee the runtime charges: `ceil(price × computeUnitLimit / 1,000,000)` lamports, saturating at u64::MAX
(Agave `compute_budget_limits.rs`). It is charged on the compute-unit **limit** you request, not on what the
transaction ends up using. The 5,000 lamports per signature base fee is not included. Returns a bigint when either
argument is a bigint; with numbers it throws `RangeError` if the answer would not be exact.

## `toInstructionsData(price, computeUnitLimit)`

```ts
{
  programId: "ComputeBudget111111111111111111111111111111",
  setComputeUnitLimit: Uint8Array,   // 5 bytes: 0x02, u32 little-endian
  setComputeUnitPrice: Uint8Array,   // 9 bytes: 0x03, u64 little-endian
  instructions: [{ programId, accounts: [], data }, { programId, accounts: [], data }],
}
```

Neither instruction takes accounts. A transaction may carry each at most once. The runtime caps the limit at
`MAX_COMPUTE_UNIT_LIMIT` (1,400,000); this function accepts any u32 and leaves that to you.

`setComputeUnitLimitData(units)` and `setComputeUnitPriceData(microLamports)` return one of them each.
Inputs may be numbers, bigints or digit strings; out-of-range values throw `RangeError`, non-integers `TypeError`.

## Errors

- `TypeError` / `RangeError`: bad input, thrown before any request.
- `RpcError` (`method`, `code`, `status`): JSON-RPC error (`code`), HTTP error including 429 (`status`), unreachable host.
- `RpcTimeoutError extends RpcError`: no answer within `timeoutMs`.

Messages name the host only, never the full URL, so an API key in the URL does not leak into logs.
