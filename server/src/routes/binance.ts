import { Router } from "express";

const router = Router();

const PRIVATE_BASES = [
  "https://api-gcp.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api.binance.com",
];

function getKeys() {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error("Binance API keys not configured");
  return { apiKey, apiSecret };
}

async function hmacSha256Hex(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signedGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const { apiKey, apiSecret } = getKeys();
  const q = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    recvWindow: "10000",
    timestamp: String(Date.now()),
  });
  q.append("signature", await hmacSha256Hex(apiSecret, q.toString()));

  let lastError = "";
  for (const base of PRIVATE_BASES) {
    const res = await fetch(`${base}${path}?${q.toString()}`, {
      headers: { "X-MBX-APIKEY": apiKey },
    });
    if (res.ok) return res.json() as Promise<T>;
    lastError = `${base} ${res.status}`;
    if (![451, 403, 418, 429, 500, 502, 503, 504].includes(res.status)) break;
  }
  throw new Error(`Binance ${path} failed: ${lastError}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Fire promises in batches with a delay between batches to avoid rate limits */
async function batchSettled<T>(
  fns: Array<() => Promise<T>>,
  batchSize = 3,
  delayMs = 400,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < fns.length; i += batchSize) {
    const batch = fns.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
    results.push(...batchResults);
    if (i + batchSize < fns.length) await sleep(delayMs);
  }
  return results;
}

// ── In-memory cache for allTrades (avoids hammering the API on every page load) ──
interface CacheEntry<T> { data: T; expiresAt: number; }
const cache = new Map<string, CacheEntry<unknown>>();

function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data as T;
}
function setCache<T>(key: string, data: T, ttlMs: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ── Routes ─────────────────────────────────────────────────────────────────

router.get("/binance/account", async (_req, res) => {
  try {
    const acc = await signedGet<{
      balances: Array<{ asset: string; free: string; locked: string }>;
      canTrade: boolean;
      accountType: string;
    }>("/api/v3/account");
    const balances = acc.balances
      .map((b) => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }))
      .filter((b) => b.free + b.locked > 0);
    res.json({ balances, canTrade: acc.canTrade, accountType: acc.accountType });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

router.get("/binance/openOrders", async (_req, res) => {
  try {
    const orders = await signedGet<Array<{
      symbol: string; orderId: number; price: string; origQty: string;
      executedQty: string; status: string; type: string; side: string;
      stopPrice: string; time: number;
    }>>("/api/v3/openOrders");
    res.json(orders);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

router.get("/binance/myTrades", async (req, res) => {
  try {
    const symbol = req.query["symbol"] as string;
    const limit = req.query["limit"] ? Number(req.query["limit"]) : 50;
    if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }
    const trades = await signedGet<Array<{
      symbol: string; id: number; orderId: number; price: string; qty: string;
      quoteQty: string; commission: string; commissionAsset: string;
      time: number; isBuyer: boolean; isMaker: boolean;
    }>>("/api/v3/myTrades", { symbol: symbol.toUpperCase(), limit });
    res.json(trades);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

/**
 * Fetch trades for ALL account assets.
 * Batches requests 3 at a time with 400 ms delays between batches so we never
 * blow through Binance's rate limits and break unrelated API calls.
 * Results are cached server-side for 3 minutes.
 */
router.get("/binance/allTrades", async (_req, res) => {
  try {
    // Return cached result if still fresh
    const cached = getCache<unknown[]>("allTrades");
    if (cached) { res.json(cached); return; }

    // 1. Get account balances (1 signed request)
    const acc = await signedGet<{
      balances: Array<{ asset: string; free: string; locked: string }>;
    }>("/api/v3/account");

    const assets = acc.balances
      .filter((b) => parseFloat(b.free) + parseFloat(b.locked) > 0)
      .map((b) => b.asset)
      .filter((a) => !["USDT", "BUSD", "FDUSD", "USDC"].includes(a));

    // 2. Fetch trades in batches of 3, 400 ms apart
    type RawTrade = {
      symbol: string; id: number; orderId: number; price: string; qty: string;
      quoteQty: string; commission: string; commissionAsset: string;
      time: number; isBuyer: boolean; isMaker: boolean;
    };

    const fns = assets.map((asset) => () =>
      signedGet<RawTrade[]>("/api/v3/myTrades", { symbol: `${asset}USDT`, limit: 500 })
    );

    const results = await batchSettled(fns, 3, 400);

    const allTrades = results
      .filter((r): r is PromiseFulfilledResult<RawTrade[]> => r.status === "fulfilled")
      .flatMap((r) => r.value)
      .sort((a, b) => b.time - a.time);

    // Cache for 3 minutes
    setCache("allTrades", allTrades, 3 * 60 * 1000);

    res.json(allTrades);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

export default router;
