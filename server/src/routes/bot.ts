import { Router } from "express";

const router = Router();

interface Snapshot {
  key: string;
  updatedAt: string | null;
  data: Record<string, unknown> | null;
}

const store = new Map<string, Snapshot>();
const soldHistory = new Map<string, Array<Record<string, unknown>>>();
const MAX_SOLD_HISTORY = 100;

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function captureSoldTrade(
  key: string,
  data: Record<string, unknown>,
  previousData: Record<string, unknown> | null,
) {
  const raw = data.last_closed_trade;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;

  const trade = raw as Record<string, unknown>;
  const symbol = typeof trade.symbol === "string" ? trade.symbol.toUpperCase() : "";
  const time = firstNumber(trade.time) ?? 0;
  const price = firstNumber(trade.price, trade.sell_price) ?? 0;
  const qty = firstNumber(trade.qty, trade.quantity, trade.sold_qty) ?? 0;
  if (!symbol || !time) return;

  const id = `${symbol}:${String(
    trade.id ??
      trade.orderId ??
      `${symbol}:${time}:${price}:${qty}`,
  )}`;
  const history = soldHistory.get(key) ?? [];
  if (history.some((item) => String(item.__history_id) === id)) return;

  const entryPrice = firstNumber(
    trade.entry_price,
    trade.avg_price,
    data.avg_price,
    data.entry_price,
    previousData?.avg_price,
    previousData?.entry_price,
  );
  const pnlUsd = firstNumber(trade.pnl_usd, trade.profit_usdt, data.pnl_usd)
    ?? (entryPrice != null && price > 0 && qty > 0 ? (price - entryPrice) * qty : undefined);
  const pnlPct = firstNumber(trade.pnl_pct, trade.profit_pct, data.pnl_pct)
    ?? (pnlUsd != null && entryPrice != null && entryPrice > 0 && qty > 0
      ? (pnlUsd / (entryPrice * qty)) * 100
      : undefined);

  history.unshift({
    ...trade,
    symbol,
    __history_id: id,
    // These optional values let the dashboard show realised PnL when the bot
    // includes its entry/cost basis in the close snapshot.
    entry_price: entryPrice ?? undefined,
    pnl_pct: pnlPct,
    pnl_usd: pnlUsd,
  });
  soldHistory.set(key, history.slice(0, MAX_SOLD_HISTORY));
}

// POST /api/bot/push?key=xxx
router.post("/bot/push", (req, res) => {
  const key = (req.query["key"] as string | undefined)?.toLowerCase();
  if (!key) {
    res.status(400).json({ error: "key query param required" });
    return;
  }
  const data = req.body as Record<string, unknown>;
  const previousData = store.get(key)?.data ?? null;
  captureSoldTrade(key, data, previousData);
  store.set(key, { key, updatedAt: new Date().toISOString(), data });
  res.json({ ok: true });
});

// GET /api/bot/data?key=xxx
router.get("/bot/data", (req, res) => {
  const key = (req.query["key"] as string | undefined)?.toLowerCase();
  if (!key) {
    res.status(400).json({ error: "key query param required" });
    return;
  }
  const snap = store.get(key) ?? { key, updatedAt: null, data: null };
  res.json(snap);
});

// GET /api/bot/sold-trades?key=dca
router.get("/bot/sold-trades", (req, res) => {
  const key = (req.query["key"] as string | undefined)?.toLowerCase();
  if (!key) {
    res.status(400).json({ error: "key query param required" });
    return;
  }
  res.json({ key, trades: soldHistory.get(key) ?? [] });
});

export default router;
