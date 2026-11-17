// Estimate a priority fee for a swap through the Raydium SOL-USDC pool (one RPC call).
// node examples/estimate.js            uses SOLANA_RPC_URL, or the public mainnet RPC
import { estimatePriorityFee, costLamports } from "../src/index.js";

const POOL = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"; // Raydium AMM v4 SOL-USDC: written by every swap through it

const r = await estimatePriorityFee({ accounts: [POOL] });
console.log(`${r.slots} slots, ${(r.nonZeroShare * 100).toFixed(1)}% with a non-zero fee`);
console.log("percentiles (micro-lamports/CU):", r.percentiles);
console.log("recommended:", r.recommended);
console.log(`"high" for a 200,000 CU swap costs ${costLamports(r.recommended.high, 200_000)} lamports on top of the base fee`);
