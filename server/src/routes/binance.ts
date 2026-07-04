import { Router } from "express";

const router = Router();

// ── Binance base URLs (tried in order; skip on 4xx/5xx block codes) ──────────
const PRIVATE_BASES = [
  "https://api-gcp.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com",
  "https://api.binance.com",
];

// ── Circuit breaker ───────────────────────────────────────────────────────────
// When Binance bans the IP (-1003, HTTP 418) it tells us exactly when the ban
// lifts via the "banned until <ms>" message. We parse that timestamp and refuse
// ALL Binance calls until it passes — stopping the retry storm that would
// otherwise extend the ban.

let bannedUntil = 0; // Unix ms; 0 = not banned

function checkCircuitBreaker() {
  if (Date.now() < bannedUntil) {
    const secsLeft = Math.ceil((bannedUntil - Date.now()) / 1000);
    throw new Error(`Binance IP banned — ${secsLeft}s remaining. Try again later.`);
  }
}

function recordBan(body: string) {
  // Response body: {"code":-1003,"msg":"...banned until 1783163570886..."}
  const match = body.match(/banned until (\d+)/);
  if (match) {
    bannedUntil = parseInt(match[1], 10);
    const secsLeft = Math.ceil((bannedUntil - Date.now()) / 1000);
    console.warn(`[binance] IP banned by Binance for ${secsLeft}s (until ${new Date(bannedUntil).toISOString()})`);
  }
}

// ── Clock-drift correction ────────────────────────────────────────────────────
// Render free-tier servers can drift by several seconds; Binance rejects
// timestamps that are >10 s off its clock (-1021 error).
// We fetch Binance server time on startup and every 30 min and apply the delta.

let timeOffset = 0; // ms to ADD to Date.now() before signing

async function syncBinanceTime(): Promise<void> {
  for (const base of PRIVATE_BASES) {
    try {
      const res = await fetch(`${base}/api/v3/time`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const { serverTime } = (await res.json()) as { serverTime: number };
      timeOffset = serverTime - Date.now();
      console.log(`[binance] time synced via ${base}, offset=${timeOffset}ms`);
      return;
    } catch {
      // try next base
    }
  }
  console.warn("[binance] time sync failed on all bases — using offset=0");
}

// Sync on startup, then every 30 minutes
syncBinanceTime();
setInterval(syncBinanceTime, 30 * 60 * 1000);

// ── Keys ──────────────────────────────────────────────────────────────────────
function getKeys() {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error("Binance API keys not configured");
  return { apiKey, apiSecret };
}

// ── HMAC-SHA256 ───────────────────────────────────────────────────────────────
async function hmacSha256Hex(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Signed GET with fallback + clock-drift correction ─────────────────────────
async function signedGet<T>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  // Refuse immediately if IP is currently banned — don't waste calls
  checkCircuitBreaker();

  const { apiKey, apiSecret } = getKeys();

  // Apply clock-drift offset so the timestamp matches Binance's clock
  const correctedNow = Date.now() + timeOffset;

  const q = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    recvWindow: "15000",
    timestamp: String(correctedNow),
  });
  q.append("signature", await hmacSha256Hex(apiSecret, q.toString()));

  // Only retry on these — 418 means IP ban, stop all bases immediately
  const RETRY_STATUS = new Set([500, 502, 503, 504]);
  let lastError = "no bases tried";

  for (const base of PRIVATE_BASES) {
    let res: Response;
    try {
      res = await fetch(`${base}${path}?${q.toString()}`, {
        headers: { "X-MBX-APIKEY": apiKey },
        signal: AbortSignal.timeout(10000),
      });
    } catch (fetchErr) {
      lastError = `${base} fetch-error: ${String(fetchErr)}`;
      continue; // network error — try next base
    }

    if (res.ok) return res.json() as Promise<T>;

    // Read body to surface the real Binance error code/message
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    lastError = `${base} HTTP-${res.status}: ${body}`;
    console.warn(`[binance] ${path} → ${lastError}`);

    // 418 = IP ban — record expiry and stop trying all other bases
    if (res.status === 418) {
      recordBan(body);
      break;
    }

    // 429 = rate limit warning — stop before we trigger a ban
    if (res.status === 429) {
      console.warn(`[binance] 429 rate limit hit on ${base}, stopping`);
      break;
    }

    if (!RETRY_STATUS.has(res.status)) break; // 400, 401, etc — no point retrying
  }

  throw new Error(`Binance ${path} failed: ${lastError}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
    results.push(...await Promise.allSettled(batch.map((fn) => fn())));
    if (i + batchSize < fns.length) await sleep(delayMs);
  }
  return results;
}

// ── In-memory cache ───────────────────────────────────────────────────────────
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

const ACCOUNT_TTL   = 60_000;  // 60 s — weight 20
const ORDERS_TTL    = 30_000;  // 30 s — weight 40
const MY_TRADES_TTL = 60_000;  // 60 s — weight 20/symbol

// ── Coin logo (CoinGecko, server-side cached 24 h) ────────────────────────────
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

// ── /api/binance/account ──────────────────────────────────────────────────────
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
    console.error("[binance] /account error:", err);
    res.status(502).json({ error: String(err) });
  }
});

// ── /api/binance/openOrders ───────────────────────────────────────────────────
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
    console.error("[binance] /openOrders error:", err);
    res.status(502).json({ error: String(err) });
  }
});

// ── /api/binance/myTrades ─────────────────────────────────────────────────────
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
    console.error("[binance] /myTrades error:", err);
    res.status(502).json({ error: String(err) });
  }
});

// ── /api/binance/allTrades ────────────────────────────────────────────────────
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
    console.error("[binance] /allTrades error:", err);
    res.status(502).json({ error: String(err) });
  }
});

export default router;
