import { Router } from "express";

const router = Router();

interface DelistSymbol {
  symbol: string;
  date: string;
  time: string;
}

interface DelistStore {
  symbols: DelistSymbol[];
  lastUpdated: string | null;
  lastHeartbeat: string | null;
}

const store: DelistStore = {
  symbols: [],
  lastUpdated: null,
  lastHeartbeat: null,
};

const DELIST_KEY = process.env.DELIST_KEY ?? "delist";
const ACTIVE_THRESHOLD_MS = 20 * 60 * 1000;

// POST /api/delist/push?key=delist
// Body: { symbols?: Array<{ symbol: string; date: string; time: string }>, heartbeat?: boolean }
router.post("/delist/push", (req, res) => {
  const key = (req.query["key"] as string | undefined) ?? "";
  if (key !== DELIST_KEY) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const body = req.body as {
    symbols?: Array<{ symbol: string; date?: string; time?: string }>;
    heartbeat?: boolean;
  };
  const now = new Date().toISOString();

  store.lastHeartbeat = now;

  if (!body.heartbeat && Array.isArray(body.symbols)) {
    store.symbols = body.symbols
      .filter((s) => s && typeof s.symbol === "string" && s.symbol.trim())
      .map((s) => ({
        symbol: s.symbol.toUpperCase().trim(),
        date: s.date ?? "",
        time: s.time ?? "",
      }));
    store.lastUpdated = now;
  }

  res.json({ ok: true, count: store.symbols.length });
});

// GET /api/delist/data
router.get("/delist/data", (_req, res) => {
  const active =
    store.lastHeartbeat !== null &&
    Date.now() - new Date(store.lastHeartbeat).getTime() < ACTIVE_THRESHOLD_MS;

  res.json({
    active,
    symbols: store.symbols,
    lastUpdated: store.lastUpdated,
    lastHeartbeat: store.lastHeartbeat,
  });
});

export default router;
