import { Router, type Response } from "express";

const router = Router();

// Use one Binance API host. Falling through several hosts after a transient
// response sends the same signed request to Binance multiple times and can
// turn a busy service into a weight ban. Set BINANCE_API_BASE only if Binance
// has told you to use a different official API host for your region.
const PRIVATE_BASE = (process.env.BINANCE_API_BASE ?? "https://api.binance.com").replace(/\/+$/, "");
const BINANCE_TIMEOUT_MS = 9_000;
const PRIVATE_MIN_INTERVAL_MS = 250;
const PRIVATE_WEIGHT_WINDOW_MS = 60_000;
// Keep a deliberately conservative local budget. Binance's limit is shared
// by every process using the same public IP, so this is a safety ceiling, not
// a replacement for checking the Binance API response headers.
const configuredWeightBudget = Number(process.env.BINANCE_WEIGHT_BUDGET ?? 1_000);
const PRIVATE_WEIGHT_BUDGET =
  Number.isFinite(configuredWeightBudget) && configuredWeightBudget > 0
    ? configuredWeightBudget
    : 1_000;

interface BinanceErrorBody {
  code?: number;
  msg?: string;
}

class BinanceRequestError extends Error {
  readonly code: number | string | null;
  readonly status: number | null;
  readonly endpoint: string;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    details: {
      code?: number | string | null;
      status?: number | null;
      endpoint: string;
      retryAfterMs?: number | null;
    },
  ) {
    super(message);
    this.name = "BinanceRequestError";
    this.code = details.code ?? null;
    this.status = details.status ?? null;
    this.endpoint = details.endpoint;
    this.retryAfterMs = details.retryAfterMs ?? null;
  }
}

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

function privateRequestWeight(path: string): number {
  if (path.endsWith("/account")) return 20;
  // These calls omit symbol, or request historical trades, so use the
  // conservative Spot API weights rather than the lighter symbol-specific
  // values.
  if (path.endsWith("/openOrders")) return 6;
  if (path.endsWith("/myTrades")) return 20;
  return 1;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

let privateQueue = Promise.resolve();
let nextPrivateRequestAt = 0;
const recentPrivateWeights: Array<{ at: number; weight: number }> = [];

/**
 * Serialises signed calls and keeps a conservative rolling weight budget.
 * This protects the shared Render egress IP even when several browser tabs,
 * routes, or history requests refresh at the same time.
 */
async function schedulePrivate<T>(path: string, task: () => Promise<T>): Promise<T> {
  const run = privateQueue.then(async () => {
    const weight = privateRequestWeight(path);

    for (;;) {
      const now = Date.now();
      while (recentPrivateWeights.length > 0 &&
        now - recentPrivateWeights[0].at >= PRIVATE_WEIGHT_WINDOW_MS) {
        recentPrivateWeights.shift();
      }

      const used = recentPrivateWeights.reduce((sum, item) => sum + item.weight, 0);
      const budgetWait = used + weight > PRIVATE_WEIGHT_BUDGET && recentPrivateWeights.length > 0
        ? recentPrivateWeights[0].at + PRIVATE_WEIGHT_WINDOW_MS - now
        : 0;
      const spacingWait = Math.max(0, nextPrivateRequestAt - now);
      const waitMs = Math.max(budgetWait, spacingWait);
      if (waitMs <= 0) break;
      await sleep(waitMs);
    }

    const reservedAt = Date.now();
    recentPrivateWeights.push({ at: reservedAt, weight });
    nextPrivateRequestAt = reservedAt + PRIVATE_MIN_INTERVAL_MS;
    return task();
  });

  // Keep the queue alive after a failed request, while returning the failure
  // to the caller that owns this request.
  privateQueue = run.then(() => undefined, () => undefined);
  return run;
}

const privateInFlight = new Map<string, Promise<unknown>>();

function privateCacheTtl(path: string): number {
  if (path.endsWith("/account")) return 30_000;
  if (path.endsWith("/openOrders")) return 15_000;
  if (path.endsWith("/myTrades")) return 30_000;
  return 10_000;
}

async function signedGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const { apiKey, apiSecret } = getKeys();
  const serializedParams = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
  const cacheKey = `private:${path}?${serializedParams}`;

  const cached = getCache<T>(cacheKey);
  if (cached !== undefined) return cached;

  const existing = privateInFlight.get(cacheKey);
  if (existing) return existing as Promise<T>;

  const request = schedulePrivate(path, async () => {
    const q = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      recvWindow: "10000",
      timestamp: String(Date.now()),
    });
    q.append("signature", await hmacSha256Hex(apiSecret, q.toString()));

    try {
      const res = await fetch(`${PRIVATE_BASE}${path}?${q.toString()}`, {
        headers: { "X-MBX-APIKEY": apiKey },
        signal: AbortSignal.timeout(BINANCE_TIMEOUT_MS),
      });
      const text = await res.text();

      let body: BinanceErrorBody | null = null;
      try {
        body = text ? JSON.parse(text) as BinanceErrorBody : null;
      } catch {
        // Keep the raw response below when Binance did not return JSON.
      }

      if (res.ok) {
        if (!text) {
          throw new BinanceRequestError("Binance returned an empty response", {
            status: res.status,
            endpoint: path,
          });
        }
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new BinanceRequestError("Binance returned invalid JSON", {
            status: res.status,
            endpoint: path,
          });
        }
      }

      const message = body?.msg || text || `HTTP ${res.status}`;
      const bannedUntil = message.match(/banned until\s+(\d+)/i)?.[1];
      const retryAfterMs = bannedUntil
        ? Math.max(0, Number(bannedUntil) - Date.now())
        : (res.status === 418 || res.status === 429 ? 60_000 : null);
      throw new BinanceRequestError(message, {
        code: body?.code,
        status: res.status,
        endpoint: path,
        retryAfterMs,
      });
    } catch (err) {
      if (err instanceof BinanceRequestError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new BinanceRequestError(
        message.includes("aborted") || message.includes("timeout")
          ? `Binance ${path} timed out after ${BINANCE_TIMEOUT_MS / 1000}s`
          : `Binance ${path} network request failed: ${message}`,
        { code: "NETWORK_ERROR", status: null, endpoint: path },
      );
    }
  }).then((data) => {
    setCache(cacheKey, data, privateCacheTtl(path));
    return data;
  });

  privateInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    privateInFlight.delete(cacheKey);
  }
}

function sendBinanceError(res: Response, err: unknown) {
  if (err instanceof BinanceRequestError) {
    const rateLimited = err.code === -1003 || err.status === 418 || err.status === 429;
    if (err.retryAfterMs != null) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil(err.retryAfterMs / 1000)));
    }
    res.status(rateLimited ? 429 : 502).json({
      error: err.message,
      code: err.code,
      upstreamStatus: err.status,
      endpoint: err.endpoint,
      retryAfterMs: err.retryAfterMs,
    });
    return;
  }

  res.status(502).json({
    error: err instanceof Error ? err.message : String(err),
    code: "BINANCE_REQUEST_FAILED",
  });
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

// ── Coin logo resolver (CoinGecko → cached server-side) ────────────────────

// Deduplicates concurrent requests for the same symbol so we only call
// CoinGecko once even if 20 img tags fire at the same time.
const logoInFlight = new Map<string, Promise<string | null>>();

async function resolveCoinLogo(symbol: string): Promise<string | null> {
  const key = `logo:${symbol}`;
  const cached = getCache<string | null>(key);
  if (cached !== undefined) return cached;

  const existing = logoInFlight.get(symbol);
  if (existing) return existing;

  const promise: Promise<string | null> = (async () => {
    try {
      // CoinGecko free-tier search — no API key required, ~30 req/min
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

      // Prefer an exact symbol match; fall back to the first result
      const exact = body.coins?.find(
        (c) => c.symbol.toUpperCase() === symbol.toUpperCase(),
      );
      const coin = exact ?? body.coins?.[0];
      const url = coin?.large ?? coin?.thumb ?? null;

      // Cache the result for 24 h (logo URLs almost never change)
      setCache(key, url, 24 * 60 * 60 * 1000);
      return url;
    } catch {
      setCache(key, null, 5 * 60 * 1000); // cache "not found" for 5 min
      return null;
    } finally {
      logoInFlight.delete(symbol);
    }
  })();

  logoInFlight.set(symbol, promise);
  return promise;
}

// GET /api/coin-logo/:symbol
// Resolves to a 302 redirect to the actual image URL (cached for 24 h).
// The browser follows the redirect transparently for <img> tags.
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
    const cached = getCache<{
      balances: Array<{ asset: string; free: number; locked: number }>;
      canTrade: boolean;
      accountType: string;
    }>("account");
    if (cached) {
      res.json(cached);
      return;
    }

    const acc = await signedGet<{
      balances: Array<{ asset: string; free: string; locked: string }>;
      canTrade: boolean;
      accountType: string;
    }>("/api/v3/account");
    const balances = acc.balances
      .map((b) => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }))
      .filter((b) => b.free + b.locked > 0);
    const payload = { balances, canTrade: acc.canTrade, accountType: acc.accountType };
    // One Binance account is configured for this service. Keep this longer
    // than the UI poll interval so tabs share one signed request.
    setCache("account", payload, 30_000);
    res.json(payload);
  } catch (err) {
    sendBinanceError(res, err);
  }
});

router.get("/binance/openOrders", async (_req, res) => {
  try {
    const cached = getCache<Array<{
      symbol: string; orderId: number; price: string; origQty: string;
      executedQty: string; status: string; type: string; side: string;
      stopPrice: string; time: number;
    }>>("openOrders");
    if (cached) {
      res.json(cached);
      return;
    }

    const orders = await signedGet<Array<{
      symbol: string; orderId: number; price: string; origQty: string;
      executedQty: string; status: string; type: string; side: string;
      stopPrice: string; time: number;
    }>>("/api/v3/openOrders");
    setCache("openOrders", orders, 15_000);
    res.json(orders);
  } catch (err) {
    sendBinanceError(res, err);
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
    sendBinanceError(res, err);
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

    // History is intentionally low priority: never burst requests for every
    // held asset, even when this card is opened alongside the dashboard.
    const results = await batchSettled(fns, 2, 1_000);

    const allTrades = results
      .filter((r): r is PromiseFulfilledResult<RawTrade[]> => r.status === "fulfilled")
      .flatMap((r) => r.value)
      .sort((a, b) => b.time - a.time);

    setCache("allTrades", allTrades, 15 * 60 * 1000);
    res.json(allTrades);
  } catch (err) {
    sendBinanceError(res, err);
  }
});

export default router;
