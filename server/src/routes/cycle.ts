import { Router } from "express";

const router = Router();

export interface CycleData {
  last_event_type: string;
  last_event_date: string;
  last_event_price: number;
  next_event_type: string;
  next_event_date: string;
  next_event_days: number;
  phase: string;
  cycle_elapsed: number;
  cycle_total: number;
  cycle_pct: number;
  current_price: number;
  change_since_last: number;
}

interface CycleSnapshot {
  updatedAt: string | null;
  data: CycleData | null;
}

let store: CycleSnapshot = { updatedAt: null, data: null };

router.post("/cycle/push", (req, res) => {
  const body = req.body as CycleData;
  store = { updatedAt: new Date().toISOString(), data: body };
  res.json({ ok: true });
});

router.get("/cycle/data", (_req, res) => {
  res.json(store);
});

export default router;
