# Discord fee alert

Posts to a Discord channel when the priority fee on an account crosses a threshold, and again when it drops back below. Uses a channel webhook, so there is no bot to host. No dependencies.

1. In Discord: Channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.
2. Run:

```bash
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..." THRESHOLD=100000 node examples/integrations/discord-alert/alert.js
```

Try it first without posting anything:

```bash
DRY_RUN=1 ONCE=1 node examples/integrations/discord-alert/alert.js
```

| Env | Default | |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | (required unless `DRY_RUN=1`) | keep it secret: anyone with it can post to your channel |
| `ACCOUNTS` | Raydium SOL-USDC pool | comma-separated writable accounts |
| `LEVEL` | `high` | `low`, `medium`, `high`, `veryHigh` or `unsafeMax` |
| `THRESHOLD` | `100000` | micro-lamports per compute unit |
| `INTERVAL_SEC` | `30` | at least 5 |
| `ONCE=1` | | post the current fee once and exit |
| `DRY_RUN=1` | | print the payload instead of posting |

The first reading only sets the state; after that it posts on each change (normal → high, high → normal), never on every check. A 429 from Discord is waited out and retried once.
