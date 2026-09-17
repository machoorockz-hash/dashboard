import { Router } from "express";

const router = Router();

interface PumpSignal {
  symbol: string;
  price: number;
  timestamp: string;
  score: number;
}

interface PumpStore {
  signals: PumpSignal[];
  lastHeartbeat: string | null;
  newsStatus: "SAFE" | "RISK";
  newsReason: string;
  whaleStatus: "NORMAL" | "HOLD";
  whaleReason: string;
}

const store = new Map<string, PumpStore>();
const PUMP_KEY = process.env.PUMP_KEY ?? "pump";
const MAX_SIGNALS = 50;
const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;

router.post("/pump/push", (req, res) => {
  const key = (req.query["key"] as string) ?? "pump";
  if (key !== PUMP_KEY) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const body = req.body as {
    symbol?: string;
    price?: number;
    score?: number;
    timestamp?: string;
    heartbeat?: boolean;
    newsStatus?: string;
    newsReason?: string;
    whaleStatus?: string;
    whaleReason?: string;
  };
  const now = new Date().toISOString();

  if (!store.has(key)) {
    store.set(key, {
      signals: [],
      lastHeartbeat: null,
      newsStatus: "SAFE",
      newsReason: "",
      whaleStatus: "NORMAL",
      whaleReason: "",
    });
  }
  const entry = store.get(key)!;
  entry.lastHeartbeat = now;

  if (body.newsStatus === "SAFE" || body.newsStatus === "RISK") {
    entry.newsStatus = body.newsStatus;
  }
  if (typeof body.newsReason === "string") {
    entry.newsReason = body.newsReason;
  }
  if (body.whaleStatus === "NORMAL" || body.whaleStatus === "HOLD") {
    entry.whaleStatus = body.whaleStatus;
  }
  if (typeof body.whaleReason === "string") {
    entry.whaleReason = body.whaleReason;
  }

  if (!body.heartbeat) {
    if (typeof body.symbol !== "string" || typeof body.price !== "number") {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    entry.signals.unshift({
      symbol: body.symbol,
      price: body.price,
      score: typeof body.score === "number" ? body.score : 0,
      timestamp: typeof body.timestamp === "string" ? body.timestamp : now,
    });
    if (entry.signals.length > MAX_SIGNALS) {
      entry.signals = entry.signals.slice(0, MAX_SIGNALS);
    }
  }

  res.json({ ok: true });
});

router.get("/pump/data", (req, res) => {
  const key = (req.query["key"] as string) ?? "pump";
  const entry = store.get(key);

  const active =
    entry?.lastHeartbeat != null &&
    Date.now() - new Date(entry.lastHeartbeat).getTime() < ACTIVE_THRESHOLD_MS;

  res.json({
    key,
    active,
    lastHeartbeat: entry?.lastHeartbeat ?? null,
    newsStatus: entry?.newsStatus ?? "SAFE",
    newsReason: entry?.newsReason ?? "",
    whaleStatus: entry?.whaleStatus ?? "NORMAL",
    whaleReason: entry?.whaleReason ?? "",
    signals: entry?.signals ?? [],
  });
});

export default router;
