import { Router, type Response } from "express";

const router = Router();

const PRIVATE_BASES = [
  "https://api-gcp.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api.binance.com",
];
const BINANCE_TIMEOUT_MS = 9_000;
// Do not retry rate-limit, WAF, or regional responses against every host.
// Doing so multiplies request weight and can turn a 429 into an IP ban (418).
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

interface BinanceErrorBody {
  code?: number;
  msg?: string;
}

class BinanceRequestError extends Error {
  readonly code: number | string | null;
  readonly status: number | null;
  readonly endpoint: string;

  constructor(
    message: string,
    details: { code?: number | string | null; status?: number | null; endpoint: string },
  ) {
    super(message);
    this.name = "BinanceRequestError";
    this.code = details.code ?? null;
    this.status = details.status ?? null;
    this.endpoint = details.endpoint;
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

async function signedGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const { apiKey, apiSecret } = getKeys();
  let lastError: unknown = null;
  const deadline = Date.now() + BINANCE_TIMEOUT_MS;

  for (const base of PRIVATE_BASES) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;

    // Rebuild the signed query for each endpoint attempt. This keeps the
    // timestamp fresh if a previous Binance host was slow or unavailable.
    const q = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      recvWindow: "10000",
      timestamp: String(Date.now()),
    });
    q.append("signature", await hmacSha256Hex(apiSecret, q.toString()));

    try {
      const res = await fetch(`${base}${path}?${q.toString()}`, {
        headers: { "X-MBX-APIKEY": apiKey },
        signal: AbortSignal.timeout(remainingMs),
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
      const error = new BinanceRequestError(message, {
        code: body?.code,
        status: res.status,
        endpoint: path,
      });
      lastError = error;
      if (!RETRYABLE_STATUSES.has(res.status)) throw error;
    } catch (err) {
      lastError = err;
      if (err instanceof BinanceRequestError && err.status !== null && !RETRYABLE_STATUSES.has(err.status)) {
        throw err;
      }
    }
  }

  if (lastError instanceof BinanceRequestError) throw lastError;
  const message = lastError instanceof Error ? lastError.message : String(lastError ?? "request failed");
  throw new BinanceRequestError(
    message.includes("aborted") || message.includes("timeout")
      ? `Binance ${path} timed out after ${BINANCE_TIMEOUT_MS / 1000}s`
      : `Binance ${path} network request failed: ${message}`,
    { code: "NETWORK_ERROR", status: null, endpoint: path },
  );
}

function sendBinanceError(res: Response, err: unknown) {
  if (err instanceof BinanceRequestError) {
    res.status(502).json({
      error: err.message,
      code: err.code,
      upstreamStatus: err.status,
      endpoint: err.endpoint,
    });
    return;
  }

  res.status(502).json({
    error: err instanceof Error ? err.message : String(err),
    code: "BINANCE_REQUEST_FAILED",
  });
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
    // One Binance account is configured for this service. A short cache keeps
    // multiple browser tabs from multiplying signed request weight.
    setCache("account", payload, 5_000);
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
    setCache("openOrders", orders, 5_000);
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

    const results = await batchSettled(fns, 3, 400);

    const allTrades = results
      .filter((r): r is PromiseFulfilledResult<RawTrade[]> => r.status === "fulfilled")
      .flatMap((r) => r.value)
      .sort((a, b) => b.time - a.time);

    setCache("allTrades", allTrades, 3 * 60 * 1000);
    res.json(allTrades);
  } catch (err) {
    sendBinanceError(res, err);
  }
});

export default router;
