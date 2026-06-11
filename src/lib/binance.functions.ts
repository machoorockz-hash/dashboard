import { createServerFn } from "@tanstack/react-start";
import { createHmac } from "crypto";
import { z } from "zod";

const BASE = "https://api.binance.com";

function sign(query: string, secret: string) {
  return createHmac("sha256", secret).update(query).digest("hex");
}

async function signedGet(path: string, params: Record<string, string | number> = {}) {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) throw new Error("Binance API keys not configured");
  const ts = Date.now();
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), timestamp: String(ts), recvWindow: "10000" });
  const sig = sign(q.toString(), apiSecret);
  q.append("signature", sig);
  const res = await fetch(`${BASE}${path}?${q.toString()}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Binance ${path} ${res.status}: ${text}`);
  }
  return res.json();
}

async function publicGet(path: string, params: Record<string, string | number> = {}) {
  const q = new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])));
  const url = `${BASE}${path}${q.toString() ? `?${q.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${path} ${res.status}`);
  return res.json();
}

export const getAccount = createServerFn({ method: "GET" }).handler(async () => {
  const acc = await signedGet("/api/v3/account");
  const balances = (acc.balances as Array<{ asset: string; free: string; locked: string }>)
    .map((b) => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }))
    .filter((b) => b.free + b.locked > 0);
  return { balances, canTrade: acc.canTrade as boolean, accountType: acc.accountType as string };
});

export const getOpenOrders = createServerFn({ method: "GET" }).handler(async () => {
  const orders = await signedGet("/api/v3/openOrders");
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
  .inputValidator((d: { symbol: string; limit?: number }) =>
    z.object({ symbol: z.string().min(1), limit: z.number().int().min(1).max(1000).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const trades = await signedGet("/api/v3/myTrades", { symbol: data.symbol.toUpperCase(), limit: data.limit ?? 50 });
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

export const getAllPrices = createServerFn({ method: "GET" }).handler(async () => {
  const data = await publicGet("/api/v3/ticker/price");
  const map: Record<string, number> = {};
  for (const t of data as Array<{ symbol: string; price: string }>) map[t.symbol] = parseFloat(t.price);
  return map;
});

export const getTickers24h = createServerFn({ method: "POST" })
  .inputValidator((d: { symbols: string[] }) => z.object({ symbols: z.array(z.string()) }).parse(d))
  .handler(async ({ data }) => {
    const symbols = JSON.stringify(data.symbols.map((s) => s.toUpperCase()));
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
  });

export const getKlines = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string; interval: string; limit?: number }) =>
    z.object({ symbol: z.string(), interval: z.string(), limit: z.number().int().min(1).max(1000).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const raw = (await publicGet("/api/v3/klines", {
      symbol: data.symbol.toUpperCase(),
      interval: data.interval,
      limit: data.limit ?? 500,
    })) as unknown[][];
    return raw.map((k) => ({
      time: Math.floor((k[0] as number) / 1000),
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));
  });
