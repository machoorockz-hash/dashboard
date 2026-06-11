import { Router } from "express";

const router = Router();

interface BotData {
  price: number;
  drop_1m: number;
  drop_5m: number;
  drop_15m: number;
  drop_1h: number;
  drop_4h: number;
  speed: number;
  volatility: number;
  status: string;
}

const store = new Map<string, { data: BotData; updatedAt: string }>();
const BOT_KEY = process.env.BOT_KEY ?? "btc";

router.post("/bot/push", (req, res) => {
  const key = (req.query["key"] as string) ?? "btc";
  if (key !== BOT_KEY) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const body = req.body as BotData;
  if (typeof body.price !== "number" || typeof body.status !== "string") {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  store.set(key, { data: body, updatedAt: new Date().toISOString() });
  res.json({ ok: true });
});

router.get("/bot/data", (req, res) => {
  const key = (req.query["key"] as string) ?? "btc";
  const entry = store.get(key);
  res.json({
    key,
    updatedAt: entry?.updatedAt ?? null,
    data: entry?.data ?? null,
  });
});

export default router;
