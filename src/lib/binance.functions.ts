import { createServerFn } from "@tanstack/react-start";

const PUBLIC_BASE = "https://data-api.binance.vision";
const PRIVATE_BASES = [
  "https://api-gcp.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com",
  "https://api.binance.com",
];

function getServerKeys() {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error("Binance API keys not configured");
  return { apiKey, apiSecret };
}

async function hmacSha256Hex(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signedGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const { apiKey, apiSecret } = getServerKeys();
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
    lastError = `${base} ${res.status}: ${await res.text()}`;
    if (![451, 403, 418, 429, 500, 502, 503, 504].includes(res.status)) break;
  }
  throw new Error(`Binance ${path} failed: ${lastError}`);
}

async function publicGet(path: string, params: Record<string, string | number> = {}) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  );
  const url = `${PUBLIC_BASE}${path}${q.toString() ? `?${q.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${path} ${res.status}`);
  return res.json();
}

export const getAccount = createServerFn({ method: "GET" }).handler(async () => {
  const acc = await signedGet<{
    balances: Array<{ asset: string; free: string; locked: string }>;
    canTrade: boolean;
    accountType: string;
  }>("/api/v3/account");
  const balances = (acc.balances as Array<{ asset: string; free: string; locked: string }>)
    .map((b) => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }))
    .filter((b) => b.free + b.locked > 0);
  return { balances, canTrade: acc.canTrade as boolean, accountType: acc.accountType as string };
});

export const getOpenOrders = createServerFn({ method: "GET" }).handler(async () => {
  const orders = await signedGet<Array<{
    symbol: string;
    orderId: number;
    price: string;
    origQty: string;
    executedQty: string;
    status: string;
    type: string;
    side: string;
    stopPrice: string;
    time: number;
  }>>("/api/v3/openOrders");
  return orders as Array<{
    symbol: string;
    orderId: number;
    price: string;
    origQty: string;
    executedQty: string;
    status: string;
    type: string;
    side: string;
    stopPrice: string;
    time: number;
  }>;
});

export const getMyTrades = createServerFn({ method: "POST" })
  .inputValidator((input: { symbol: string; limit?: number }) => input)
  .handler(async ({ data }) => {
  const { symbol, limit } = data;
  const trades = await signedGet<Array<{
    symbol: string;
    id: number;
    orderId: number;
    price: string;
    qty: string;
    quoteQty: string;
    commission: string;
    commissionAsset: string;
    time: number;
    isBuyer: boolean;
    isMaker: boolean;
  }>>("/api/v3/myTrades", {
    symbol: symbol.toUpperCase(),
    limit: limit ?? 50,
  });
  return trades as Array<{
    symbol: string;
    id: number;
    orderId: number;
    price: string;
    qty: string;
    quoteQty: string;
    commission: string;
    commissionAsset: string;
    time: number;
    isBuyer: boolean;
    isMaker: boolean;
  }>;
});

export async function getAllPrices() {
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
    symbol: string;
    lastPrice: string;
    priceChangePercent: string;
  }>;
  return arr.map((t) => ({
    symbol: t.symbol,
    price: parseFloat(t.lastPrice),
    changePct: parseFloat(t.priceChangePercent),
  }));
}

export async function getKlines(args: {
  data: { symbol: string; interval: string; limit?: number };
}) {
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
