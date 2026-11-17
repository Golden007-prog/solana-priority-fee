// One JSON-RPC call with a timeout, and the errors it can throw.

export const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";

/** The RPC answered with an error, a bad HTTP status, or not at all. */
export class RpcError extends Error {
  /** @param {string} message @param {{ method?: string, code?: number|null, status?: number|null }} [info] */
  constructor(message, { method = null, code = null, status = null } = {}) {
    super(message);
    this.name = "RpcError";
    this.method = method; this.code = code; this.status = status;
  }
}

/** The RPC did not answer within timeoutMs. */
export class RpcTimeoutError extends RpcError {
  constructor(method, timeoutMs) {
    super(`the RPC did not answer ${method} within ${timeoutMs} ms`, { method });
    this.name = "RpcTimeoutError";
  }
}

// Host only: a URL with an API key in it never reaches an error message.
const host = (url) => { try { return new URL(url).host; } catch { return "the RPC"; } };

export async function rpc(rpcUrl, method, params, opts = {}) {
  // Not AbortSignal.timeout(): its timer is unref'd, so with nothing else keeping Node alive (a custom fetch,
  // a stalled request) the process exits before the timeout fires and the call never settles.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new DOMException("The operation was aborted due to timeout", "TimeoutError")), opts.timeoutMs ?? 10_000);
  try { return await rpcOnce(rpcUrl, method, params, opts, ac.signal); } finally { clearTimeout(timer); }
}

async function rpcOnce(rpcUrl, method, params, { fetch: fetchFn = globalThis.fetch, timeoutMs = 10_000 } = {}, signal) {
  let res;
  try {
    res = await fetchFn(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal,
    });
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") throw new RpcTimeoutError(method, timeoutMs);
    throw new RpcError(`${host(rpcUrl)} could not be reached (${e?.message || e})`, { method });
  }
  if (res.status === 429) throw new RpcError(`${host(rpcUrl)} is rate limiting ${method} (HTTP 429)`, { method, status: 429 });
  if (!res.ok) throw new RpcError(`${host(rpcUrl)} answered HTTP ${res.status} to ${method}`, { method, status: res.status });
  let body;
  try { body = await res.json(); } catch { throw new RpcError(`${host(rpcUrl)} sent a reply to ${method} that is not JSON`, { method, status: res.status }); }
  if (body?.error) throw new RpcError(`${method} failed: ${body.error.message || "RPC error"} (code ${body.error.code})`, { method, code: body.error.code ?? null, status: res.status });
  return body.result;
}
