// Type declarations for solana-priority-fee.

export declare const PUBLIC_RPC: "https://api.mainnet-beta.solana.com";
export declare const MAX_ACCOUNTS: 128;
export declare const COMPUTE_BUDGET_PROGRAM_ID: "ComputeBudget111111111111111111111111111111";
export declare const MAX_COMPUTE_UNIT_LIMIT: 1400000;

export type LevelName = "low" | "medium" | "high" | "veryHigh" | "unsafeMax";
/** Level name -> percentile (0..100). */
export type Levels = Record<string, number>;
export declare const DEFAULT_LEVELS: Readonly<Record<LevelName, number>>;

export interface NetOptions {
  /** Default: SOLANA_RPC_URL, else the public mainnet RPC. */
  rpcUrl?: string;
  /** Per request, default 10000. */
  timeoutMs?: number;
  /** A fetch to use instead of the global one. */
  fetch?: typeof fetch;
}

export interface FeeSample {
  slot: number;
  /** micro-lamports per compute unit */
  fee: number;
}

export interface Percentiles {
  min: number; p25: number; p50: number; p75: number; p90: number; p95: number; max: number;
}

export interface FeeSummary {
  unit: "microLamportsPerComputeUnit";
  slots: number;
  firstSlot: number | null;
  lastSlot: number | null;
  samplesUsed: number;
  ignoreZero: boolean;
  /** 0..1, share of slots whose fee was above zero */
  nonZeroShare: number;
  percentiles: Percentiles;
  levels: Record<LevelName, number> & Levels;
  recommended: Record<LevelName, number> & Record<string, number>;
}

export interface FeeEstimate extends FeeSummary {
  accounts: string[];
}

export interface EstimateOptions extends NetOptions {
  /** Writable accounts your transaction will lock (max 128). */
  accounts?: string[];
  /** Leave zero-fee slots out of the percentiles. */
  ignoreZero?: boolean;
  /** Override or add levels: name -> percentile. */
  levels?: Levels;
}

export interface WatchOptions extends EstimateOptions {
  /** Number of successful windows to keep, from 1 to 60. Defaults to 1 (history omitted). */
  historyWindows?: number;
}

export interface WatchEstimate extends FeeEstimate {
  history?: {
    windows: number;
    summary: FeeSummary;
    /** Change in p50 between the oldest and newest retained windows. */
    trend: "up" | "down" | "flat" | null;
  };
}

export declare function estimatePriorityFee(options?: EstimateOptions): Promise<FeeEstimate>;
export declare function getRecentFees(accounts?: string[], options?: NetOptions): Promise<FeeSample[]>;
export declare function summarizeFees(samples: FeeSample[], options?: { ignoreZero?: boolean; levels?: Levels }): FeeSummary;
export declare function percentile(sorted: number[], p: number): number;
export declare function watch(
  intervalMs: number,
  callback: (error: Error | null, estimate: WatchEstimate | null) => void,
  options?: WatchOptions,
): { stop(): void };

export type Whole = number | bigint | string;
export declare function costLamports(price: number | string, computeUnits: number | string): number;
export declare function costLamports(price: bigint | Whole, computeUnits: bigint): bigint;
export declare function costLamports(price: bigint, computeUnits: Whole): bigint;
export declare function setComputeUnitLimitData(units: Whole): Uint8Array;
export declare function setComputeUnitPriceData(microLamports: Whole): Uint8Array;

export interface RawInstruction {
  programId: string;
  accounts: [];
  data: Uint8Array;
}
export declare function toInstructionsData(price: Whole, computeUnitLimit: Whole): {
  programId: string;
  setComputeUnitLimit: Uint8Array;
  setComputeUnitPrice: Uint8Array;
  instructions: [RawInstruction, RawInstruction];
};

export declare class RpcError extends Error {
  method: string | null;
  code: number | null;
  status: number | null;
}
export declare class RpcTimeoutError extends RpcError {}
