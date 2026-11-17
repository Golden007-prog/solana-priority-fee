# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-17

### Added

- `estimatePriorityFee`: percentiles (min, p25, p50, p75, p90, p95, max), non-zero share and named levels from `getRecentPrioritizationFees`, optionally scoped to up to 128 writable accounts, with an `ignoreZero` option.
- `getRecentFees`, `summarizeFees`, `percentile` for raw samples and offline summaries.
- `watch(intervalMs, cb)`: sequential re-estimation (minimum interval 1 s).
- `costLamports` with the runtime's round-up rule, and `toInstructionsData` / `setComputeUnitLimitData` / `setComputeUnitPriceData` for the ComputeBudget instruction bytes.
- `RpcError` and `RpcTimeoutError`; every request has a timeout.
- CLI `solana-priority-fee [account...] [--json] [--ignore-zero] [--cu N] [--watch S] [--rpc URL]`.
- TypeScript declarations.

[1.0.0]: https://github.com/blixvip/solana-priority-fee/releases/tag/v1.0.0
