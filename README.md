# solana-priority-fee

**Solana priority fee estimator: the compute unit price recent blocks were landing at.** Percentiles and named levels from any RPC's `getRecentPrioritizationFees`, optionally scoped to the pool or bonding curve your transaction writes to, plus the raw ComputeBudget instruction bytes to pay that price. Zero dependencies.

![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen)
![node: 20+](https://img.shields.io/badge/node-20%2B-blue)
[![license: MIT](https://img.shields.io/badge/license-MIT-black)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/grokbot)
[![GitHub stars](https://img.shields.io/github/stars/blixvip/solana-priority-fee?style=social)](https://github.com/blixvip/solana-priority-fee/stargazers)

<a href="https://blixvip.com"><img src="assets/blix-hero.jpg" width="100%" alt="BLIX: AI-powered Solana memecoin terminal. Trade memes first."></a>

**[Start trading at blixvip.com →](https://blixvip.com)** &nbsp;·&nbsp; [Public API](https://blixvip.com/api) &nbsp;·&nbsp; [MCP server](https://blixvip.com/mcp) &nbsp;·&nbsp; [Discord](https://discord.gg/grokbot)

Built by the team behind **[Blix](https://blixvip.com)**, a Solana memecoin terminal; this is the fee check we run before building a swap, as a standalone library.

If solana-priority-fee saves you time, **[give it a ⭐](https://github.com/blixvip/solana-priority-fee)**. It helps other Solana developers find it.

## The problem

A Solana transaction that touches a busy account (a popular pool, a pump.fun bonding curve during a launch) competes with every other transaction writing to that account. Pay too little per compute unit and it waits or expires; pay a fixed "safe" number and you overpay most of the time. Every RPC already exposes the data to pick a price, `getRecentPrioritizationFees`, but it returns 150 raw numbers, and you still need to turn a price into the two ComputeBudget instructions.

## Features

- Percentiles (min, p25, p50, p75, p90, p95, max) in micro-lamports per compute unit over the slots the node has cached (up to 150).
- Scoped to up to 128 writable accounts your transaction will lock, or unscoped.
- The share of slots with a non-zero fee, and an option to ignore zero-fee slots.
- Named levels `low` / `medium` / `high` / `veryHigh` / `unsafeMax` mapped to percentiles (25 / 50 / 75 / 95 / 100), each one changeable, and your own levels added.
- `costLamports(price, cu)`: the lamport cost, rounded the way the runtime rounds it.
- `toInstructionsData(price, cuLimit)`: the SetComputeUnitLimit and SetComputeUnitPrice instruction data and the program id, so you can build them without `@solana/web3.js`.
- `watch(intervalMs, cb)`: re-estimate on an interval, never two requests at once. Set `historyWindows` to include a rolling summary and median trend across recent polls.
- A CLI with a table or `--json`. TypeScript declarations included.
- Works with any Solana RPC, including the free public one. No Blix service is used or needed.

## Install

```bash
npm install github:blixvip/solana-priority-fee
```

Node 20 or newer. No dependencies.

## Quick start

CLI (the account below is the Raydium SOL-USDC pool, written by every swap through it):

```bash
npx github:blixvip/solana-priority-fee 58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2
```

```
150 slots (470678895-470679044), 1 account; 83.3% of slots had a non-zero fee

  percentile         micro-lamports/CU
  min                               0
  p25                          10,000
  p50                          10,000
  p75                          10,000
  p90                          10,000
  p95                          10,000
  max                         166,666

  level              micro-lamports/CU   cost at 200,000 CU
  low (p25)                    10,000        2,000 lamports
  medium (p50)                 10,000        2,000 lamports
  high (p75)                   10,000        2,000 lamports
  veryHigh (p95)               10,000        2,000 lamports
  unsafeMax (p100)            166,666       33,334 lamports

  cost excludes the 5,000 lamport base fee per signature.
```

(A real mainnet answer from the public RPC on 2026-11-17, the same one stored in `test/fixtures/`. Your numbers will differ.)

Options: `--ignore-zero`, `--cu <units>` for the cost column, `--watch <seconds>`, `--json`, `--rpc <url>`. With no account it reads every recent slot unfiltered.

Library:

```js
import { estimatePriorityFee, toInstructionsData, costLamports } from "solana-priority-fee";

const fee = await estimatePriorityFee({ accounts: ["58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"] });
fee.percentiles;          // { min, p25, p50, p75, p90, p95, max }   micro-lamports per CU
fee.recommended.high;     // the p75 price
fee.nonZeroShare;         // 0..1

const ix = toInstructionsData(fee.recommended.high, 200_000);
ix.programId;             // "ComputeBudget111111111111111111111111111111"
ix.setComputeUnitLimit;   // Uint8Array(5)  [2, u32 LE]
ix.setComputeUnitPrice;   // Uint8Array(9)  [3, u64 LE]
costLamports(fee.recommended.high, 200_000);   // lamports, on top of the base fee
```

## Examples

| | |
|---|---|
| [`examples/estimate.js`](examples/estimate.js) | one estimate for a swap through a pool, with its lamport cost (1 RPC call) |
| [`examples/instructions.js`](examples/instructions.js) | the two ComputeBudget instructions as hex, offline |
| [`examples/watch.js`](examples/watch.js) | re-estimate every 5 seconds, twice, then stop (2 RPC calls) |

Run any of them with `node examples/<name>.js`.

## API

`estimatePriorityFee`, `getRecentFees`, `summarizeFees`, `percentile`, `watch`, `costLamports`, `toInstructionsData`, `setComputeUnitLimitData`, `setComputeUnitPriceData`, the constants, and the `RpcError` / `RpcTimeoutError` classes. Full reference in [docs/API.md](docs/API.md); types in [index.d.ts](index.d.ts).

## Configuration

| | |
|---|---|
| `SOLANA_RPC_URL` | the RPC to ask. Default: `https://api.mainnet-beta.solana.com` (free, public, rate limited; it serves this method) |
| `rpcUrl` option / `--rpc` | the same per call |
| `timeoutMs` | per request, default 10,000 |
| `levels` | e.g. `{ high: 90, turbo: 99 }`, merged over the defaults |
| `ignoreZero` / `--ignore-zero` | drop zero-fee slots before taking percentiles |

Any Solana RPC works: the public endpoint, or the free tiers of Helius, QuickNode, Alchemy, Triton and others (third-party services, each with its own limits). Nothing here talks to Blix.

## How it works

One JSON-RPC call, `getRecentPrioritizationFees`, with your accounts as its only parameter (or none). The node answers one `{ slot, prioritizationFee }` per block in its fee cache, which holds up to 150 recent blocks.

What each number means matters. In Agave's fee cache (`runtime/src/prioritization_fee_cache.rs`) each block records, from its non-vote transactions:

- the **lowest** compute-unit price of any transaction in the block, and
- for each account a transaction wrote to, the **lowest** price among the transactions in that block that write-locked it.

For your list of accounts the node returns, per block, the higher of the block's lowest price and each listed account's lowest price. So every sample is a **floor**: the cheapest price that still landed in that block next to writes to those accounts. It is not the average or typical price paid. The official docs put it as "fees observed for transactions that lock all of the supplied accounts as writable"; the source takes the maximum over the per-account minimums, which is what is described here.

The library sorts the samples, takes nearest-rank percentiles (every value is one that was actually observed), and reads each level's price from its percentile. A high percentile of per-block minimums means "in 3 of 4 recent blocks, the cheapest landed transaction on this account paid at most this much".

`costLamports` uses the runtime's formula from Agave's `compute_budget_limits.rs`: `ceil(price × computeUnitLimit / 1,000,000)`. The instruction layout comes from the official interface (`anza-xyz/solana-sdk`, `compute-budget-interface`): discriminator `2` + u32 little-endian for SetComputeUnitLimit, `3` + u64 little-endian for SetComputeUnitPrice. The tests check the bytes against that interface's own test vectors.

## Limitations

- **This is not Helius' `getPriorityFeeEstimate`.** That is a separate, Helius-only API with its own method; this library does not reimplement it and does not call it. The level names are borrowed because people know them; the numbers will not match.
- The input is per-block **minimums**. A block where one cheap transaction landed on your pool reports that cheap price even if most transactions in it paid far more. For a contested account, read the upper levels.
- One node's view: a recently restarted node has fewer than 150 blocks, and nodes can differ slightly. 150 blocks is roughly one minute.
- An account that no transaction wrote to recently adds nothing: the answer falls back to each block's overall minimum, which on mainnet is often `0` (see `test/fixtures/recent-fees-global.json`, all 150 slots zero). Scope to an account your transaction actually writes, not a program id (programs are read-only).
- The priority fee is only one way to land faster. Jito tips, a sender or staked connection, and a tight compute-unit limit are outside this library.
- `costLamports` excludes the base fee (5,000 lamports per signature). The fee is charged on the compute-unit limit you request, not on what is used, so set a realistic limit.

## Contributing

Issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Questions, ideas or claiming an issue: **[discord.gg/grokbot](https://discord.gg/grokbot)**. Tests run offline: `npm test`.

## Related projects

| | |
|---|---|
| [solana-rpc-pool](https://github.com/blixvip/solana-rpc-pool) | A Solana RPC load balancer: several endpoints, rate limits, failover |
| [solana-ws-keepalive](https://github.com/blixvip/solana-ws-keepalive) | Solana WebSocket subscriptions that reconnect on their own |
| [pump-curve](https://github.com/blixvip/pump-curve) | Read a pump.fun bonding curve: price, market cap, progress, migration (its curve address is a good account to scope fees to) |
| [solana-tx-parse](https://github.com/blixvip/solana-tx-parse) | See the priority fee a landed transaction actually paid |

## Contributors

Every merged pull request is credited in the release notes. Pick a [good first issue](https://github.com/blixvip/solana-priority-fee/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) or say hi in the [Discord](https://discord.gg/grokbot).

<a href="https://github.com/blixvip/solana-priority-fee/graphs/contributors"><img src="https://contrib.rocks/image?repo=blixvip/solana-priority-fee" alt="Contributors to solana-priority-fee"></a>

## License

MIT
