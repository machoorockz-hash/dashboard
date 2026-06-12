import { Router } from "express";

const router = Router();

interface Snapshot {
  key: string;
  updatedAt: string | null;
  data: Record<string, unknown> | null;
}

const store = new Map<string, Snapshot>();

// POST /api/bot/push?key=xxx
router.post("/bot/push", (req, res) => {
  const key = (req.query["key"] as string | undefined)?.toLowerCase();
  if (!key) {
    res.status(400).json({ error: "key query param required" });
    return;
  }
  const data = req.body as Record<string, unknown>;
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

export default router;
