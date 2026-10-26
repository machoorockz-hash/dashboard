import { Router } from "express";

const router = Router();

type EmaTimeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h";
type Ema200Above = Partial<Record<EmaTimeframe, boolean>>;

interface PumpSignal {
  symbol: string;
  price: number;
  timestamp: string;
  score: number;
  signalType?: string;
  overallScore?: number;
  volume24hUsd?: number;
  minimum24hVolumeUsd?: number;
  last72hVolumeBlocksUsd?: number[];
  minimum24hVolumePerBlockUsd?: number;
  closed1mCandleUsd?: number;
  minimumClosed1mCandleUsd?: number;
  psi?: number;
  fakeScore?: number;
  rocPct?: number;
  rsi?: number;
  ema200Above?: Ema200Above;
  volumeRatio?: number;
}

interface PumpPushBody {
  symbol?: string;
  price?: number;
  score?: number;
  timestamp?: string;
  signalType?: string;
  overallScore?: number;
  volume24hUsd?: number;
  minimum24hVolumeUsd?: number;
  last72hVolumeBlocksUsd?: unknown;
  minimum24hVolumePerBlockUsd?: number;
  closed1mCandleUsd?: number;
  minimumClosed1mCandleUsd?: number;
  psi?: number;
  fakeScore?: number;
  rocPct?: number;
  rsi?: number;
  ema200Above?: unknown;
  volumeRatio?: number;
  heartbeat?: boolean;
  newsStatus?: string;
  newsReason?: string;
  whaleStatus?: string;
  whaleReason?: string;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function finiteNumberArray(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every(
    (item) => typeof item === "number" && Number.isFinite(item),
  )
    ? value
    : undefined;
}

function parseEma200Above(value: unknown): Ema200Above | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const parsed: Ema200Above = {};
  const timeframes: EmaTimeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h"];
  for (const timeframe of timeframes) {
    if (typeof source[timeframe] === "boolean") {
      parsed[timeframe] = source[timeframe] as boolean;
    }
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
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

  const body = req.body as PumpPushBody;
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
    const overallScore = finiteNumber(body.overallScore);
    entry.signals.unshift({
      symbol: body.symbol,
      price: body.price,
      // Keep the legacy score field populated for existing dashboard consumers.
      score: overallScore ?? finiteNumber(body.score) ?? 0,
      timestamp: typeof body.timestamp === "string" ? body.timestamp : now,
      signalType: typeof body.signalType === "string" ? body.signalType : undefined,
      overallScore,
      volume24hUsd: finiteNumber(body.volume24hUsd),
      minimum24hVolumeUsd: finiteNumber(body.minimum24hVolumeUsd),
      last72hVolumeBlocksUsd: finiteNumberArray(body.last72hVolumeBlocksUsd),
      minimum24hVolumePerBlockUsd: finiteNumber(body.minimum24hVolumePerBlockUsd),
      closed1mCandleUsd: finiteNumber(body.closed1mCandleUsd),
      minimumClosed1mCandleUsd: finiteNumber(body.minimumClosed1mCandleUsd),
      psi: finiteNumber(body.psi),
      fakeScore: finiteNumber(body.fakeScore),
      rocPct: finiteNumber(body.rocPct),
      rsi: finiteNumber(body.rsi),
      ema200Above: parseEma200Above(body.ema200Above),
      volumeRatio: finiteNumber(body.volumeRatio),
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
