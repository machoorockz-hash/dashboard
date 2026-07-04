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

// ── Server time sync ───────────────────────────────────────────────────────
// Keeps a running offset (ms) between local clock and Binance server time.
// This prevents -1021 "Timestamp outside recvWindow" errors caused by
// server clock drift (common on Render free tier after cold starts).

let timeOffset = 0; // local + timeOffset ≈ Binance server time

async function syncBinanceTime(): Promise<void> {
  try {
    const before = Date.now();
    const res = await fetch("https://api.binance.com/api/v3/time", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return;
    const after = Date.now();
    const { serverTime } = await res.json() as { serverTime: number };
    // Use midpoint of the request as local time estimate
    const localMid = Math.floor((before + after) / 2);
    timeOffset = serverTime - localMid;
  } catch {
    // Non-fatal — keep previous offset
  }
}

// Sync once on startup, then every 30 minutes
syncBinanceTime();
setInterval(syncBinanceTime, 30 * 60 * 1000);

function binanceTimestamp(): number {
  return Date.now() + timeOffset;
}

// ──────────────────────────────────────────────────────────────────────────

async function signedGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const { apiKey, apiSecret } = getKeys();
  const q = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    recvWindow: "15000",
    timestamp: String(binanceTimestamp()),
  });
  q.append("signature", await hmacSha256Hex(apiSecret, q.toString()));

  let lastError = "";
  for (const base of PRIVATE_BASES) {
    const res = await fetch(`${base}${path}?${q.toString()}`, {
      headers: { "X-MBX-APIKEY": apiKey },
      signal: AbortSignal.timeout(10000),
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

// ── Generic in-memory cache ────────────────────────────────────────────────

interface CacheEntry<T> { data: T; expiresAt: number; }
const cache = new Map<string, CacheEntry<unknown>>();

function getCache<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return undefined; }
  return entry.data as T;
}
function setCache<T>(key: string, data: T, ttlMs: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ── In-flight deduplication ────────────────────────────────────────────────
// If multiple requests arrive while a fetch is already in-flight, they all
// wait for the same promise instead of each spawning their own Binance call.

const inFlight = new Map<string, Promise<unknown>>();

async function cachedSignedGet<T>(
  cacheKey: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = getCache<T>(cacheKey);
  if (cached !== undefined) return cached;

  const existing = inFlight.get(cacheKey) as Promise<T> | undefined;
  if (existing) return existing;

  const promise: Promise<T> = fetcher().then((data) => {
    setCache(cacheKey, data, ttlMs);
    inFlight.delete(cacheKey);
    return data;
  }).catch((err) => {
    inFlight.delete(cacheKey);
    throw err;
  });

  inFlight.set(cacheKey, promise as Promise<unknown>);
  return promise;
}

// ── Coin logo resolver (CoinGecko → cached server-side) ────────────────────

const logoInFlight = new Map<string, Promise<string | null>>();

async function resolveCoinLogo(symbol: string): Promise<string | null> {
  const key = `logo:${symbol}`;
  const cached = getCache<string | null>(key);
  if (cached !== undefined) return cached;

  const existing = logoInFlight.get(symbol);
  if (existing) return existing;

  const promise: Promise<string | null> = (async () => {
    try {
      const resp = await fetch(
        `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(6000),
        },
      );
      if (!resp.ok) return null;

      const body = await resp.json() as {
        coins?: Array<{ symbol: string; thumb?: string; large?: string }>;
      };

      const exact = body.coins?.find(
        (c) => c.symbol.toUpperCase() === symbol.toUpperCase(),
      );
      const coin = exact ?? body.coins?.[0];
      const url = coin?.large ?? coin?.thumb ?? null;

      setCache(key, url, 24 * 60 * 60 * 1000);
      return url;
    } catch {
      setCache(key, null, 5 * 60 * 1000);
      return null;
    } finally {
      logoInFlight.delete(symbol);
    }
  })();

  logoInFlight.set(symbol, promise);
  return promise;
}

// GET /api/coin-logo/:symbol
router.get("/coin-logo/:symbol", async (req, res) => {
  const symbol = (req.params["symbol"] ?? "").toUpperCase();
  if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }

  const url = await resolveCoinLogo(symbol);
  if (url) {
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    res.redirect(302, url);
  } else {
    res.status(404).json({ error: "logo not found" });
  }
});

// ── Binance signed routes ──────────────────────────────────────────────────

// Account — cached 12 s (frontend polls every 15 s; avoids duplicate Binance
// calls and protects against rate-limit spikes on cold-start / tab reopens).
router.get("/binance/account", async (_req, res) => {
  try {
    type RawAccount = {
      balances: Array<{ asset: string; free: string; locked: string }>;
      canTrade: boolean;
      accountType: string;
    };

    const acc = await cachedSignedGet<RawAccount>(
      "account",
      12_000, // 12 s TTL
      () => signedGet<RawAccount>("/api/v3/account"),
    );

    const balances = acc.balances
      .map((b) => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }))
      .filter((b) => b.free + b.locked > 0);

    res.json({ balances, canTrade: acc.canTrade, accountType: acc.accountType });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// Open orders — cached 6 s (frontend polls every 8 s).
router.get("/binance/openOrders", async (_req, res) => {
  try {
    type RawOrder = {
      symbol: string; orderId: number; price: string; origQty: string;
      executedQty: string; status: string; type: string; side: string;
      stopPrice: string; time: number;
    };

    const orders = await cachedSignedGet<RawOrder[]>(
      "openOrders",
      6_000, // 6 s TTL
      () => signedGet<RawOrder[]>("/api/v3/openOrders"),
    );

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

router.get("/binance/allTrades", async (_req, res) => {
  try {
    const cached = getCache<unknown[]>("allTrades");
    if (cached) { res.json(cached); return; }

    type RawAccount = {
      balances: Array<{ asset: string; free: string; locked: string }>;
    };

    // Re-use the cached account snapshot if available; fall back to a fresh call
    const acc = await cachedSignedGet<RawAccount>(
      "account",
      12_000,
      () => signedGet<RawAccount>("/api/v3/account"),
    );

    const assets = acc.balances
      .filter((b) => parseFloat(b.free) + parseFloat(b.locked) > 0)
      .map((b) => b.asset)
      .filter((a) => !["USDT", "BUSD", "FDUSD", "USDC"].includes(a));

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

    setCache("allTrades", allTrades, 3 * 60 * 1000);
    res.json(allTrades);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

export default router;
