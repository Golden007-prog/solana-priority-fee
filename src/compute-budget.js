// The Compute Budget program's instruction data, built by hand so you do not need @solana/web3.js or @solana/kit.
//
// Layout, from the official interface (anza-xyz/solana-sdk, compute-budget-interface/src/lib.rs): one discriminator
// byte, then the number in little-endian. Its own test pins it: set_compute_unit_limit(257) == [2, 1, 1, 0, 0] and
// set_compute_unit_price(u64::MAX) == [3, 255 x 8].
//
//   0 Unused (reserved)
//   1 RequestHeapFrame(u32)
//   2 SetComputeUnitLimit(u32)
//   3 SetComputeUnitPrice(u64)   micro-lamports per compute unit
//   4 SetLoadedAccountsDataSizeLimit(u32)

export const COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111";
/** The most compute units one transaction may request (MAX_COMPUTE_UNIT_LIMIT in Agave). */
export const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;
const MICRO_LAMPORTS_PER_LAMPORT = 1_000_000n;
const U32_MAX = 0xffff_ffffn;
const U64_MAX = 0xffff_ffff_ffff_ffffn;

function toBig(value, name, max) {
  let n;
  if (typeof value === "bigint") n = value;
  else if (typeof value === "number" && Number.isSafeInteger(value)) n = BigInt(value);
  else if (typeof value === "string" && /^\d+$/.test(value)) n = BigInt(value);
  else throw new TypeError(`${name} must be a whole number (number, bigint or digit string), got ${String(value)}`);
  if (n < 0n || n > max) throw new RangeError(`${name} must be between 0 and ${max}, got ${n}`);
  return n;
}

/** Instruction data for SetComputeUnitLimit: 5 bytes, [2, u32 LE]. */
export function setComputeUnitLimitData(units) {
  const n = toBig(units, "computeUnits", U32_MAX);
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, Number(n), true);
  return data;
}

/** Instruction data for SetComputeUnitPrice: 9 bytes, [3, u64 LE]. The price is in micro-lamports per compute unit. */
export function setComputeUnitPriceData(microLamports) {
  const n = toBig(microLamports, "price", U64_MAX);
  const data = new Uint8Array(9);
  data[0] = 3;
  new DataView(data.buffer).setBigUint64(1, n, true);
  return data;
}

/**
 * Both compute-budget instructions, ready to put at the front of a transaction.
 * @param {number|bigint} price     micro-lamports per compute unit
 * @param {number} computeUnitLimit compute units the transaction may use (the fee is charged on this, not on what it uses)
 */
export function toInstructionsData(price, computeUnitLimit) {
  const limit = setComputeUnitLimitData(computeUnitLimit);
  const priceData = setComputeUnitPriceData(price);
  return {
    programId: COMPUTE_BUDGET_PROGRAM_ID,
    setComputeUnitLimit: limit,
    setComputeUnitPrice: priceData,
    // The same two as instructions: no accounts, just the program and the data.
    instructions: [
      { programId: COMPUTE_BUDGET_PROGRAM_ID, accounts: [], data: limit },
      { programId: COMPUTE_BUDGET_PROGRAM_ID, accounts: [], data: priceData },
    ],
  };
}

/**
 * The priority fee in lamports for a price and a compute-unit limit, the way the runtime charges it:
 * ceil(price * limit / 1,000,000), capped at u64::MAX. The 5,000-lamport-per-signature base fee is not included.
 * Returns a bigint if you pass a bigint, a number otherwise (throws if that number would not be exact).
 */
export function costLamports(price, computeUnits) {
  const p = toBig(price, "price", U64_MAX), cu = toBig(computeUnits, "computeUnits", U32_MAX);
  let fee = (p * cu + MICRO_LAMPORTS_PER_LAMPORT - 1n) / MICRO_LAMPORTS_PER_LAMPORT;
  if (fee > U64_MAX) fee = U64_MAX;
  if (typeof price === "bigint" || typeof computeUnits === "bigint") return fee;
  if (fee > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("fee is above Number.MAX_SAFE_INTEGER: pass bigints to get it exactly");
  return Number(fee);
}
