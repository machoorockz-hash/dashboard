const PUBLIC_BASE = "https://data-api.binance.vision";
const REQUEST_TIMEOUT_MS = 9_000;

export class BinanceClientError extends Error {
  readonly status: number | null;
  readonly code: number | string | null;
  readonly endpoint: string;

  constructor(
    message: string,
    details: { status?: number | null; code?: number | string | null; endpoint: string },
  ) {
    super(message);
    this.name = "BinanceClientError";
    this.status = details.status ?? null;
    this.code = details.code ?? null;
    this.endpoint = details.endpoint;
  }
}

async function fetchJson<T>(url: string, endpoint: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Preserve a useful error below even when the server returns plain text.
    }

    if (!response.ok) {
      const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
      const code = typeof record.code === "number" || typeof record.code === "string"
        ? record.code
        : response.status;
      const message = typeof record.error === "string"
        ? record.error
        : typeof record.msg === "string"
        ? record.msg
        : text || `Request failed with HTTP ${response.status}`;
      const displayMessage = code !== null && code !== undefined
        ? `[${String(code)}] ${message}`
        : message;
      throw new BinanceClientError(displayMessage, {
        status: response.status,
        code,
        endpoint,
      });
    }

    if (!body) {
      throw new BinanceClientError("Binance returned an empty response", {
        status: response.status,
        endpoint,
      });
    }
    return body as T;
  } catch (err) {
    if (err instanceof BinanceClientError) throw err;
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new BinanceClientError(
        `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`,
        { code: "TIMEOUT", endpoint },
      );
    }
    throw new BinanceClientError(
      err instanceof Error ? `Network error: ${err.message}` : "Network error",
      { code: "NETWORK_ERROR", endpoint },
    );
  }
}

async function publicGet(path: string, params: Record<string, string | number> = {}) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  );
  const url = `${PUBLIC_BASE}${path}${q.toString() ? `?${q.toString()}` : ""}`;
  return fetchJson<unknown>(url, path);
}

async function apiGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  );
  const url = `/api${path}${q.toString() ? `?${q.toString()}` : ""}`;
  return fetchJson<T>(url, path);
}

export async function getAccount() {
  return apiGet<{
    balances: Array<{ asset: string; free: number; locked: number }>;
    canTrade: boolean;
    accountType: string;
  }>("/binance/account");
}

export async function getOpenOrders() {
  return apiGet<Array<{
    symbol: string; orderId: number; price: string; origQty: string;
    executedQty: string; status: string; type: string; side: string;
    stopPrice: string; time: number;
  }>>("/binance/openOrders");
}

export async function getMyTrades(args: { data: { symbol: string; limit?: number } }) {
  const { symbol, limit } = args.data;
  return apiGet<Array<{
    symbol: string; id: number; orderId: number; price: string; qty: string;
    quoteQty: string; commission: string; commissionAsset: string;
    time: number; isBuyer: boolean; isMaker: boolean;
  }>>("/binance/myTrades", { symbol: symbol.toUpperCase(), ...(limit ? { limit } : {}) });
}

export async function getAllPrices(): Promise<Record<string, number>> {
  const data = await publicGet("/api/v3/ticker/price");
  const map: Record<string, number> = {};
  for (const t of data as Array<{ symbol: string; price: string }>) {
    map[t.symbol] = parseFloat(t.price);
  }
  return map;
}

export async function getTickers24h(args: { data: { symbols: string[] } }) {
  const symbols = JSON.stringify(args.data.symbols.map((s) => s.toUpperCase()));
  const arr = (await publicGet("/api/v3/ticker/24hr", { symbols })) as Array<{
    symbol: string; lastPrice: string; priceChangePercent: string;
  }>;
  return arr.map((t) => ({
    symbol: t.symbol,
    price: parseFloat(t.lastPrice),
    changePct: parseFloat(t.priceChangePercent),
  }));
}

export async function getKlines(args: { data: { symbol: string; interval: string; limit?: number } }) {
  const { symbol, interval, limit } = args.data;
  const raw = (await publicGet("/api/v3/klines", {
    symbol: symbol.toUpperCase(),
    interval,
    limit: limit ?? 500,
  })) as unknown[][];
  return raw.map((k) => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}
