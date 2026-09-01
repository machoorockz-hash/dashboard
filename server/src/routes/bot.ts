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
  const existingIndex = history.findIndex((item) => String(item.__history_id) === id);

  const entryPrice = firstNumber(
    trade.entry_price,
    trade.avg_price,
    trade.average_entry,
    trade.average_entry_price,
    trade.buy_price,
    trade.cost_price,
    trade.dca_avg_price,
    data.avg_price,
    data.entry_price,
    data.average_entry,
    data.average_entry_price,
    data.buy_price,
    data.cost_price,
    data.dca_avg_price,
    previousData?.avg_price,
    previousData?.entry_price,
    previousData?.average_entry,
    previousData?.average_entry_price,
    previousData?.buy_price,
    previousData?.cost_price,
    previousData?.dca_avg_price,
  );
  const pnlUsd = firstNumber(
    trade.pnl_usd,
    trade.profit_usdt,
    trade.profit_loss_usdt,
    trade.realized_pnl_usdt,
    trade.realised_pnl_usdt,
    trade.dca_pnl_usd,
    data.pnl_usd,
    data.profit_usdt,
    data.profit_loss_usdt,
    data.realized_pnl_usdt,
    data.realised_pnl_usdt,
    data.dca_pnl_usd,
    previousData?.pnl_usd,
    previousData?.profit_usdt,
    previousData?.profit_loss_usdt,
    previousData?.realized_pnl_usdt,
    previousData?.realised_pnl_usdt,
    previousData?.dca_pnl_usd,
  )
    ?? (entryPrice != null && price > 0 && qty > 0 ? (price - entryPrice) * qty : undefined);
  const pnlPct = firstNumber(
    trade.pnl_pct,
    trade.profit_pct,
    trade.profit_loss_pct,
    trade.realized_pnl_pct,
    trade.realised_pnl_pct,
    trade.dca_pnl_pct,
    data.pnl_pct,
    data.profit_pct,
    data.profit_loss_pct,
    data.realized_pnl_pct,
    data.realised_pnl_pct,
    data.dca_pnl_pct,
    previousData?.pnl_pct,
    previousData?.profit_pct,
    previousData?.profit_loss_pct,
    previousData?.realized_pnl_pct,
    previousData?.realised_pnl_pct,
    previousData?.dca_pnl_pct,
  )
    ?? (pnlUsd != null && entryPrice != null && entryPrice > 0 && qty > 0
      ? (pnlUsd / (entryPrice * qty)) * 100
      : undefined);

  const normalizedTrade = {
    ...trade,
    symbol,
    __history_id: id,
    // These optional values let the dashboard show realised PnL when the bot
    // includes its entry/cost basis in the close snapshot.
    entry_price: entryPrice ?? undefined,
    pnl_pct: pnlPct,
    pnl_usd: pnlUsd,
  };

  if (existingIndex >= 0) {
    history[existingIndex] = { ...history[existingIndex], ...normalizedTrade };
  } else {
    history.unshift(normalizedTrade);
  }
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
