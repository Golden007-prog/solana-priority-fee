// A tiny JSON fee API on node:http: GET /fee?accounts=<a,b>&cu=200000&ignoreZero=1
// No dependencies. Answers are cached for a couple of seconds so many clients cost one RPC call.
//
//   node examples/integrations/http-endpoint/server.js            listens on 127.0.0.1:8787
//   PORT=9000 HOST=0.0.0.0 SOLANA_RPC_URL=https://... node examples/integrations/http-endpoint/server.js
//   curl "http://127.0.0.1:8787/fee?accounts=58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { estimatePriorityFee, costLamports, MAX_COMPUTE_UNIT_LIMIT, RpcError } from "../../../src/index.js";

const json = (res, status, body, extra = {}) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...extra });
  res.end(JSON.stringify(body));
};

/**
 * A request handler you can mount in any node:http server.
 * @param {{ cacheMs?: number, rpcUrl?: string, fetch?: typeof fetch, timeoutMs?: number }} [options]
 */
export function createFeeHandler({ cacheMs = 2000, ...rpcOptions } = {}) {
  const cache = new Map(); // key -> { at, promise }

  const estimate = (accounts, ignoreZero) => {
    const key = `${accounts.join(",")}|${ignoreZero}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < cacheMs) return hit.promise; // also shares an in-flight request
    const promise = estimatePriorityFee({ accounts, ignoreZero, ...rpcOptions });
    cache.set(key, { at: Date.now(), promise });
    promise.catch(() => cache.delete(key)); // never cache a failure
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    return promise;
  };

  return async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET" }); return res.end(); }
    if (req.method !== "GET") return json(res, 405, { error: "use GET" });
    if (url.pathname === "/health") return json(res, 200, { ok: true });
    if (url.pathname !== "/fee") return json(res, 404, { error: "not found; try /fee?accounts=<address>" });

    const accounts = (url.searchParams.get("accounts") || "").split(",").map((a) => a.trim()).filter(Boolean);
    const ignoreZero = ["1", "true"].includes(url.searchParams.get("ignoreZero") ?? "");
    const cu = Number(url.searchParams.get("cu") ?? 200_000);
    if (!(Number.isInteger(cu) && cu >= 0 && cu <= MAX_COMPUTE_UNIT_LIMIT)) return json(res, 400, { error: `cu must be a whole number from 0 to ${MAX_COMPUTE_UNIT_LIMIT}` });

    try {
      const r = await estimate(accounts, ignoreZero);
      const costAtCu = Object.fromEntries(Object.entries(r.recommended).map(([k, v]) => [k, costLamports(v, cu)]));
      return json(res, 200, { ...r, computeUnitLimit: cu, costLamports: costAtCu, baseFeeLamportsPerSignature: 5000 }, { "cache-control": `public, max-age=${Math.ceil(cacheMs / 1000)}` });
    } catch (err) {
      if (err instanceof TypeError || err instanceof RangeError) return json(res, 400, { error: err.message });
      if (err instanceof RpcError) return json(res, 502, { error: `RPC failed: ${err.message}` });
      return json(res, 500, { error: "internal error" });
    }
  };
}

// Run directly: start a server.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787), host = process.env.HOST || "127.0.0.1";
  createServer(createFeeHandler()).listen(port, host, () => {
    console.log(`fee API on http://${host}:${port}/fee?accounts=<address>  (Ctrl+C to stop)`);
  });
}
