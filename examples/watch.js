// Re-estimate every 5 seconds, print the "medium" price twice, then stop (two RPC calls).
// node examples/watch.js
import { watch } from "../src/index.js";

let n = 0;
const w = watch(5000, (err, r) => {
  if (err) console.error("estimate failed:", err.message);
  else console.log(`slot ${r.lastSlot}: medium ${r.recommended.medium} micro-lamports/CU, ${(r.nonZeroShare * 100).toFixed(0)}% of slots non-zero`);
  if (++n === 2) w.stop();
}, { accounts: ["58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"] });
