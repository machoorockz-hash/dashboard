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

// ── Circuit breaker ────────────────────────────────────────────────────────
// When Binance returns 429 or 418, we stop ALL signed calls for a cooling
// period rather than hammering the API and deepening the ban.
let circuitOpenUntil = 0; // unix-ms; 0 = circuit closed (healthy)

function circuitOpen() {
  return Date.now() < circuitOpenUntil;
}

function tripCircuit(status: number) {
  // 429 = rate limited → cool off 60s
  // 418 = IP banned    → cool off 3 min
  const coolMs = status === 418 ? 3 * 60_000 : 60_000;
  circuitOpenUntil = Date.now() + coolMs;
  console.warn(`[binance] circuit tripped (HTTP ${status}) — pausing Binance calls for ${coolMs / 1000}s`);
}

async function signedGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  if (circuitOpen()) {
    const wait = Math.ceil((circuitOpenUntil - Date.now()) / 1000);
    throw new Error(`Binance rate-limited — circuit open, ${wait}s remaining`);
  }

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

    // Trip the circuit on rate-limit / IP-ban responses
    if (res.status === 429 || res.status === 418) {
      tripCircuit(res.status);
      throw new Error(`Binance ${path} rate-limited (${res.status})`);
    }

    lastError = `${base} ${res.status}`;
    if (![451, 403, 500, 502, 503, 504].includes(res.status)) break;
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

// Returns stale cached data even if expired — used as fallback on error
// so the UI stays populated during a rate-limit window instead of going blank.
function getStale<T>(key: string): T | undefined {
  const entry = cache.get(key);
  return entry ? (entry.data as T) : undefined;
}

// Cache TTLs for signed endpoints (keeps Binance API weight usage low)
const ACCOUNT_TTL   = 30_000;  // 30s  — weight 20, polled every 15s
const ORDERS_TTL    = 15_000;  // 15s  — weight 40, polled every 8s
const MY_TRADES_TTL = 30_000;  // 30s  — weight 20 per symbol

// ── Coin logo resolver ─────────────────────────────────────────────────────

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
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) },
      );
      if (!resp.ok) return null;

      const body = await resp.json() as {
        coins?: Array<{ symbol: string; thumb?: string; large?: string }>;
      };
      const exact = body.coins?.find((c) => c.symbol.toUpperCase() === symbol.toUpperCase());
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

router.get("/binance/account", async (_req, res) => {
  try {
    const cached = getCache<object>("account");
    if (cached) { res.json(cached); return; }

    const acc = await signedGet<{
      balances: Array<{ asset: string; free: string; locked: string }>;
      canTrade: boolean;
      accountType: string;
    }>("/api/v3/account");

    const balances = acc.balances
      .map((b) => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }))
      .filter((b) => b.free + b.locked > 0);

    const result = { balances, canTrade: acc.canTrade, accountType: acc.accountType };
    setCache("account", result, ACCOUNT_TTL);
    res.json(result);
  } catch (err) {
    // Return stale data if available — keeps UI populated during rate-limit window
    const stale = getStale<object>("account");
    if (stale) { res.json(stale); return; }
    res.status(502).json({ error: String(err) });
  }
});

router.get("/binance/openOrders", async (_req, res) => {
  try {
    const cached = getCache<unknown[]>("openOrders");
    if (cached) { res.json(cached); return; }

    const orders = await signedGet<Array<{
      symbol: string; orderId: number; price: string; origQty: string;
      executedQty: string; status: string; type: string; side: string;
      stopPrice: string; time: number;
    }>>("/api/v3/openOrders");

    setCache("openOrders", orders, ORDERS_TTL);
    res.json(orders);
  } catch (err) {
    const stale = getStale<unknown[]>("openOrders");
    if (stale) { res.json(stale); return; }
    res.status(502).json({ error: String(err) });
  }
});

router.get("/binance/myTrades", async (req, res) => {
  try {
    const symbol = req.query["symbol"] as string;
    const limit = req.query["limit"] ? Number(req.query["limit"]) : 50;
    if (!symbol) { res.status(400).json({ error: "symbol required" }); return; }

    const sym = symbol.toUpperCase();
    const cacheKey = `myTrades:${sym}:${limit}`;
    const cached = getCache<unknown[]>(cacheKey);
    if (cached) { res.json(cached); return; }

    const trades = await signedGet<Array<{
      symbol: string; id: number; orderId: number; price: string; qty: string;
      quoteQty: string; commission: string; commissionAsset: string;
      time: number; isBuyer: boolean; isMaker: boolean;
    }>>("/api/v3/myTrades", { symbol: sym, limit });

    setCache(cacheKey, trades, MY_TRADES_TTL);
    res.json(trades);
  } catch (err) {
    const sym = ((req.query["symbol"] as string) ?? "").toUpperCase();
    const limit = req.query["limit"] ? Number(req.query["limit"]) : 50;
    const stale = getStale<unknown[]>(`myTrades:${sym}:${limit}`);
    if (stale) { res.json(stale); return; }
    res.status(502).json({ error: String(err) });
  }
});

router.get("/binance/allTrades", async (_req, res) => {
  try {
    const cached = getCache<unknown[]>("allTrades");
    if (cached) { res.json(cached); return; }

    const acc = await signedGet<{
      balances: Array<{ asset: string; free: string; locked: string }>;
    }>("/api/v3/account");

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
    const stale = getStale<unknown[]>("allTrades");
    if (stale) { res.json(stale); return; }
    res.status(502).json({ error: String(err) });
  }
});

export default router;
