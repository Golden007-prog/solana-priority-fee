// Build the two ComputeBudget instructions by hand: no network, no @solana/web3.js.
// node examples/instructions.js
import { toInstructionsData, costLamports } from "../src/index.js";

const price = 25_000;      // micro-lamports per compute unit
const limit = 150_000;     // compute units the transaction may use

const ix = toInstructionsData(price, limit);
const hex = (b) => Buffer.from(b).toString("hex");
console.log("program id:          ", ix.programId);
console.log("SetComputeUnitLimit: ", hex(ix.setComputeUnitLimit));
console.log("SetComputeUnitPrice: ", hex(ix.setComputeUnitPrice));
console.log("priority fee:        ", costLamports(price, limit), "lamports");

// With @solana/web3.js you would wrap each one as:
//   new TransactionInstruction({ programId: new PublicKey(ix.programId), keys: [], data: Buffer.from(ix.setComputeUnitPrice) })
