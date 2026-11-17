# HTTP fee endpoint

A JSON priority-fee API on plain `node:http`, no dependencies. Answers are cached for 2 seconds per query, so many clients cost one RPC call.

```bash
node examples/integrations/http-endpoint/server.js
# fee API on http://127.0.0.1:8787/fee?accounts=<address>

curl "http://127.0.0.1:8787/fee?accounts=58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2"
```

| Request | |
|---|---|
| `GET /fee` | the estimate: `percentiles`, `recommended` (micro-lamports per CU), `costLamports` per level, plus everything `estimatePriorityFee` returns |
| `?accounts=a,b` | writable accounts to scope to (max 128) |
| `?cu=300000` | compute-unit limit for `costLamports` (default 200000, max 1400000) |
| `?ignoreZero=1` | leave zero-fee slots out |
| `GET /health` | `{"ok":true}` |

Bad input is a 400, an RPC failure a 502 (never cached). CORS is open (`*`).

| Env | Default |
|---|---|
| `PORT` | `8787` |
| `HOST` | `127.0.0.1` (set `0.0.0.0` to expose it) |
| `SOLANA_RPC_URL` | the public mainnet RPC |

To mount it in your own server: `import { createFeeHandler } from "./server.js"` and pass the handler to `http.createServer`. A real run is in [VERIFY.md](../../../VERIFY.md).
