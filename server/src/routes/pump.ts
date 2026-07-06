import { Router } from "express";

const router = Router();

interface PumpSignal {
  symbol: string;
  price: number;
  timestamp: string;
}

interface PumpStore {
  signals: PumpSignal[];
  lastHeartbeat: string | null;
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

  const body = req.body as { symbol?: string; price?: number; heartbeat?: boolean };
  const now = new Date().toISOString();

  if (!store.has(key)) {
    store.set(key, { signals: [], lastHeartbeat: null });
  }
  const entry = store.get(key)!;
  entry.lastHeartbeat = now;

  if (!body.heartbeat) {
    if (typeof body.symbol !== "string" || typeof body.price !== "number") {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    entry.signals.unshift({ symbol: body.symbol, price: body.price, timestamp: now });
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
    signals: entry?.signals ?? [],
  });
});

export default router;
