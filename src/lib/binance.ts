const PUBLIC_BASE = "https://data-api.binance.vision";

async function publicGet(path: string, params: Record<string, string | number> = {}) {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  );
  const url = `${PUBLIC_BASE}${path}${q.toString() ? `?${q.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${path} ${res.status}`);
  return res.json();
}

async function apiGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const q = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  );
  const url = `/api${path}${q.toString() ? `?${q.toString()}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
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
