// Post to a Discord channel when the priority fee on an account crosses a threshold, and again when it comes back down.
// Uses a Discord webhook (Channel settings -> Integrations -> Webhooks -> New Webhook -> Copy Webhook URL). No bot, no deps.
//
//   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... node examples/integrations/discord-alert/alert.js
//
//   ACCOUNTS       comma-separated writable accounts to watch (default: the Raydium SOL-USDC pool)
//   LEVEL          which level to compare: low | medium | high | veryHigh (default high)
//   THRESHOLD      micro-lamports per compute unit (default 100000)
//   INTERVAL_SEC   how often to check, at least 5 (default 30)
//   ONCE=1         check once, post the current fee whatever it is, and exit (good for testing the webhook)
//   DRY_RUN=1      print the Discord payload instead of posting it
import { pathToFileURL } from "node:url";
import { estimatePriorityFee, watch, costLamports } from "../../../src/index.js";

const RAYDIUM_SOL_USDC = "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2";
const short = (a) => `${a.slice(0, 4)}...${a.slice(-4)}`;
const fmt = (n) => n.toLocaleString("en-US");

/** "high" when the price is at or above the threshold, "normal" otherwise. */
export const stateFor = (price, threshold) => (price >= threshold ? "high" : "normal");

/**
 * The Discord webhook body for an estimate. `kind` is "high", "normal" (back below) or "snapshot".
 * @returns {{ username: string, embeds: object[] }}
 */
export function buildMessage(estimate, { level = "high", threshold, kind = "snapshot", cu = 200_000 }) {
  const price = estimate.recommended[level];
  const title = kind === "high" ? `Solana priority fees are up: ${fmt(price)} micro-lamports/CU`
    : kind === "normal" ? `Solana priority fees are back down: ${fmt(price)} micro-lamports/CU`
    : `Solana priority fee now: ${fmt(price)} micro-lamports/CU`;
  const color = kind === "high" ? 0xe5484d : kind === "normal" ? 0x30a46c : 0x8fb4ff;
  const p = estimate.percentiles;
  return {
    username: "Solana fee alert",
    embeds: [{
      title,
      description: `\`${level}\` level (p${estimate.levels[level]}) over the last ${estimate.slots} slots` +
        (estimate.accounts.length ? ` for ${estimate.accounts.map((a) => `\`${short(a)}\``).join(", ")}` : " (no account filter)") +
        `. Threshold: ${fmt(threshold)}.`,
      color,
      fields: [
        { name: "p50 / p75 / p95", value: `${fmt(p.p50)} / ${fmt(p.p75)} / ${fmt(p.p95)}`, inline: true },
        { name: `Cost at ${fmt(cu)} CU`, value: `${fmt(costLamports(price, cu))} lamports + 5,000 base`, inline: true },
        { name: "Slots with a fee", value: `${(estimate.nonZeroShare * 100).toFixed(0)}%`, inline: true },
      ],
      footer: { text: `slots ${estimate.firstSlot}-${estimate.lastSlot} · solana-priority-fee` },
      timestamp: new Date().toISOString(),
    }],
  };
}

/** POST a payload to a Discord webhook. Waits and retries once if Discord answers 429. */
export async function postWebhook(url, payload, { fetch: fetchFn = globalThis.fetch } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) });
    if (res.status === 429 && attempt === 0) {
      const body = await res.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, Math.min(10_000, Math.ceil((body.retry_after ?? 1) * 1000))));
      continue;
    }
    if (!res.ok) throw new Error(`Discord webhook answered HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.status;
  }
  throw new Error("Discord webhook kept answering 429");
}

export async function main(env = process.env) {
  const accounts = (env.ACCOUNTS || RAYDIUM_SOL_USDC).split(",").map((a) => a.trim()).filter(Boolean);
  const level = env.LEVEL || "high";
  const threshold = Number(env.THRESHOLD ?? 100_000);
  const interval = Number(env.INTERVAL_SEC ?? 30);
  const dry = env.DRY_RUN === "1", once = env.ONCE === "1";
  if (!dry && !/^https?:\/\//.test(env.DISCORD_WEBHOOK_URL || "")) {
    throw new Error("set DISCORD_WEBHOOK_URL to your webhook URL (https://discord.com/api/webhooks/...), or DRY_RUN=1");
  }
  if (!["low", "medium", "high", "veryHigh", "unsafeMax"].includes(level)) throw new Error(`unknown LEVEL ${level}`);
  if (!(threshold >= 0)) throw new Error("THRESHOLD must be a number");
  if (!(interval >= 5)) throw new Error("INTERVAL_SEC must be at least 5");
  const url = env.DISCORD_WEBHOOK_URL;
  const send = async (payload) => {
    if (dry) console.log(JSON.stringify(payload, null, 2));
    else console.log(`posted (${await postWebhook(url, payload)}): ${payload.embeds[0].title}`);
  };

  if (once) {
    const r = await estimatePriorityFee({ accounts });
    return send(buildMessage(r, { level, threshold, kind: "snapshot" }));
  }

  let state = null; // unknown until the first answer: the first reading only sets the state, it does not post
  console.log(`watching ${accounts.map(short).join(", ")} every ${interval}s: alert when ${level} >= ${fmt(threshold)}`);
  watch(interval * 1000, async (err, r) => {
    if (err) return console.error("estimate failed:", err.message);
    const next = stateFor(r.recommended[level], threshold);
    if (state !== null && next !== state) {
      try { await send(buildMessage(r, { level, threshold, kind: next })); } catch (e) { console.error(e.message); }
    }
    state = next;
  }, { accounts });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
