import { Router } from "express";

const router = Router();

interface BotData {
  price: number;
  drop_1m: number;
  drop_5m: number;
  drop_15m: number;
  drop_1h: number;
  drop_4h: number;
  peak_1m: number;
  peak_5m: number;
  peak_15m: number;
  peak_1h: number;
  peak_4h: number;
  speed: number;
  volatility: number;
  status: string;
  trade_mode?: string;
}

interface Snapshot {
  key: string;
  updatedAt: string | null;
  data: BotData | null;
}

// In-memory store keyed by bot key (e.g. "btc")
const store = new Map<string, Snapshot>();

// POST /api/bot/push?key=btc
router.post("/bot/push", (req, res) => {
  const key = (req.query["key"] as string | undefined)?.toLowerCase();
  if (!key) {
    res.status(400).json({ error: "key query param required" });
    return;
  }
  const body = req.body as Partial<BotData>;
  const data: BotData = {
    price:      Number(body.price      ?? 0),
    drop_1m:    Number(body.drop_1m    ?? 0),
    drop_5m:    Number(body.drop_5m    ?? 0),
    drop_15m:   Number(body.drop_15m   ?? 0),
    drop_1h:    Number(body.drop_1h    ?? 0),
    drop_4h:    Number(body.drop_4h    ?? 0),
    peak_1m:    Number(body.peak_1m    ?? body.price ?? 0),
    peak_5m:    Number(body.peak_5m    ?? body.price ?? 0),
    peak_15m:   Number(body.peak_15m   ?? body.price ?? 0),
    peak_1h:    Number(body.peak_1h    ?? body.price ?? 0),
    peak_4h:    Number(body.peak_4h    ?? body.price ?? 0),
    speed:      Number(body.speed      ?? 0),
    volatility: Number(body.volatility ?? 0),
    status:     String(body.status     ?? "SAFE"),
    trade_mode: body.trade_mode ? String(body.trade_mode) : undefined,
  };
  store.set(key, { key, updatedAt: new Date().toISOString(), data });
  res.json({ ok: true });
});

// GET /api/bot/data?key=btc
router.get("/bot/data", (req, res) => {
  const key = (req.query["key"] as string | undefined)?.toLowerCase();
  if (!key) {
    res.status(400).json({ error: "key query param required" });
    return;
  }
  const snap = store.get(key) ?? { key, updatedAt: null, data: null };
  res.json(snap);
});

export default router;
