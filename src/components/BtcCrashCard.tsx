import { useEffect, useRef, useState } from "react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/* ─────────────────────────── TYPES ─────────────────────────── */
interface BotData {
  price: number;
  drop_1m: number; drop_5m: number; drop_15m: number;
  drop_1h: number; drop_4h: number;
  peak_1m: number; peak_5m: number; peak_15m: number;
  peak_1h: number; peak_4h: number;
  speed: number; volatility: number; status: string;
  trade_mode?: string; pause_reason?: string;
  whale_count?: number; whale_usd_total?: number; whale_buy_total?: number;
  whale_net_flow?: number; whale_net_flow_level?: string;
  consec_drops?: number; vol_spike?: boolean;
  funding_rate?: number; funding_level?: string; funding_bias?: string;
  liq_usd_60s?: number; liq_level?: string; liq_largest?: number;
  lower_highs?: number; lower_highs_alert?: boolean;
  whale_net_flow_5m?: number;
  whale_net_flow_15m?: number; whale_net_flow_15m_level?: string;
  red_candle_count?: number; red_candle_total?: number; red_candle_ratio_alert?: boolean;
  vol_imbalance_ratio?: number | null; vol_imbalance_level?: string;
}
interface Snapshot { key: string; updatedAt: string | null; data: BotData | null; }

interface CycleData {
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
interface CycleSnapshot { updatedAt: string | null; data: CycleData | null; }

/* ─────────────────────────── CONFIG ─────────────────────────── */
const STAGE: Record<string, {
  color: string; colorMid: string; glow: string; border: string; label: string; sub: string;
}> = {
  SAFE:       { color: "#0dd9aa", colorMid: "rgba(13,217,170,0.5)",  glow: "rgba(13,217,170,0.18)",  border: "rgba(13,217,170,0.25)",  label: "SAFE",  sub: "" },
  WATCH:      { color: "#f5c542", colorMid: "rgba(245,197,66,0.5)",  glow: "rgba(245,197,66,0.18)",  border: "rgba(245,197,66,0.25)",  label: "WATCH", sub: "BE SELECTIVE" },
  RISK:       { color: "#f97316", colorMid: "rgba(249,115,22,0.5)",  glow: "rgba(249,115,22,0.18)",  border: "rgba(249,115,22,0.25)",  label: "RISK",  sub: "HOLD OFF NEW BUYS" },
  SELL_ALERT: { color: "#f87171", colorMid: "rgba(248,113,113,0.5)", glow: "rgba(248,113,113,0.18)", border: "rgba(248,113,113,0.25)", label: "ALERT", sub: "PAUSE BUYING" },
  DANGER:     { color: "#ef4444", colorMid: "rgba(239,68,68,0.55)",  glow: "rgba(239,68,68,0.22)",   border: "rgba(239,68,68,0.32)",   label: "DANGER",sub: "CONSIDER SELLING" },
};

const LVL: Record<string, string> = {
  NORMAL: "#0dd9aa", WATCH: "#f5c542", RISK: "#f97316", DANGER: "#ef4444",
};

const TF_ROWS = [
  { t: "1m",  dk: "drop_1m"  as keyof BotData, pk: "peak_1m"  as keyof BotData },
  { t: "5m",  dk: "drop_5m"  as keyof BotData, pk: "peak_5m"  as keyof BotData },
  { t: "15m", dk: "drop_15m" as keyof BotData, pk: "peak_15m" as keyof BotData },
  { t: "1h",  dk: "drop_1h"  as keyof BotData, pk: "peak_1h"  as keyof BotData },
  { t: "4h",  dk: "drop_4h"  as keyof BotData, pk: "peak_4h"  as keyof BotData },
];

/* ─────────────────────────── HELPERS ─────────────────────────── */
const fmt2   = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtK   = (n: number) => n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(0)}K` : `$${n.toFixed(0)}`;
const fmtFnd = (r: number) => `${r >= 0 ? "+" : ""}${(r * 100).toFixed(4)}%`;
const since  = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s/60)}m ${s%60}s ago`;
};
const dropCol = (p: number) => p >= 4 ? "#ef4444" : p >= 2 ? "#f97316" : p >= 1 ? "#f5c542" : "#0dd9aa";

/* ─────────────────────────── PRESSURE BARS ─────────────────────────── */
function PressureBars({ pct, inactive }: { pct: number; inactive: boolean }) {
  const [animLit, setAnimLit] = useState(0);
  const color  = inactive ? "transparent" : dropCol(pct);
  const TOTAL  = 12;
  const target = inactive ? 0 : Math.round(Math.min(pct / 6, 1) * TOTAL);

  useEffect(() => {
    setAnimLit(0);
    if (inactive || target === 0) return;
    let i = 0;
    const tick = () => {
      i++;
      setAnimLit(i);
      if (i < target) setTimeout(() => requestAnimationFrame(tick), 40);
    };
    const delay = setTimeout(() => requestAnimationFrame(tick), 100);
    return () => clearTimeout(delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct, inactive]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
      {Array.from({ length: TOTAL }).map((_, i) => {
        const filled = i < animLit;
        const isTip  = filled && i === animLit - 1;
        const brightness = filled ? (0.70 + (i / (TOTAL - 1)) * 0.30) : 1;
        return (
          <div key={i} style={{
            width: "6px",
            height: "18px",
            borderRadius: "3px",
            background: filled ? color : "rgba(255,255,255,0.07)",
            opacity: brightness,
            boxShadow: isTip
              ? `0 0 4px 1px ${color}90, 0 0 8px 2px ${color}28`
              : filled
              ? `0 0 3px 1px ${color}28`
              : "none",
            transition: `background 0.12s ease ${i * 18}ms, box-shadow 0.15s ease`,
          }} />
        );
      })}
    </div>
  );
}

/* ─────────────────────────── LEVEL BADGE ─────────────────────────── */
function LvlBadge({ level }: { level: string }) {
  const c = LVL[level] ?? "#0dd9aa";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: "5px",
      background: `${c}16`, border: `1px solid ${c}38`,
      color: c, fontSize: "8px", fontWeight: 900,
      letterSpacing: "0.12em", textTransform: "uppercase",
      flexShrink: 0,
    }}>
      {level}
    </span>
  );
}

/* ─────────────────────────── SIGNAL CARD ─────────────────────────── */
function SigCard({
  icon, title, value, sub, lvlColor, level, danger,
}: {
  icon: string; title: string; value: string;
  sub?: string; lvlColor: string; level?: string; danger?: boolean;
}) {
  return (
    <div style={{
      position: "relative", overflow: "hidden",
      borderRadius: "14px",
      border: "1px solid rgba(255,255,255,0.07)",
      background: "rgba(255,255,255,0.04)",
      padding: "14px 12px",
      display: "flex", flexDirection: "column", gap: "7px",
      cursor: "default",
    }}>
      {danger && (
        <div style={{
          position: "absolute", top: 0, left: "20%", right: "20%", height: "1px",
          background: `linear-gradient(90deg, transparent, ${lvlColor}85, transparent)`,
          animation: "_bc_epulse 2.2s ease-in-out infinite",
        }} />
      )}
      <div style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: "6px", flexWrap: "wrap",
      }}>
        <span style={{
          fontSize: "9px", fontWeight: 800, letterSpacing: "0.1em",
          color: "rgba(255,255,255,0.28)", textTransform: "uppercase",
          lineHeight: 1.3, flexShrink: 1, minWidth: 0,
        }}>
          {icon} {title}
        </span>
        {level && <LvlBadge level={level} />}
      </div>
      <div style={{
        fontSize: "18px", fontWeight: 900, lineHeight: 1,
        fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
        color: lvlColor, wordBreak: "break-all",
        textShadow: "none",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: "10px", color: "rgba(255,255,255,0.28)",
          fontVariantNumeric: "tabular-nums", fontWeight: 500,
        }}>{sub}</div>
      )}
    </div>
  );
}

/* ─────────────────────────── CYCLE PROGRESS BAR ─────────────────────────── */
function CycleProgressBar({ pct, phase }: { pct: number; phase: string }) {
  const [animPct, setAnimPct] = useState(0);
  const isDeclining = phase === "declining";
  const fillColor   = isDeclining ? "#ef4444" : "#0dd9aa";
  const barLen      = 44;
  const filled      = Math.round(Math.min(pct, 100) / 100 * barLen);

  useEffect(() => {
    setAnimPct(0);
    const t = setTimeout(() => setAnimPct(pct), 80);
    return () => clearTimeout(t);
  }, [pct]);

  return (
    <div>
      {/* Smooth bar */}
      <div style={{
        height: "5px", borderRadius: "99px",
        background: "rgba(255,255,255,0.07)",
        overflow: "hidden",
        marginBottom: "8px",
      }}>
        <div style={{
          height: "100%",
          width: `${animPct}%`,
          borderRadius: "99px",
          background: isDeclining
            ? "linear-gradient(90deg, #f97316, #ef4444)"
            : "linear-gradient(90deg, #0dd9aa, #06b6d4)",
          transition: "width 1.2s cubic-bezier(0.22,1,0.36,1)",
          boxShadow: isDeclining
            ? "0 0 8px 2px rgba(239,68,68,0.35)"
            : "0 0 8px 2px rgba(13,217,170,0.35)",
        }} />
      </div>

      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em",
        color: "rgba(255,255,255,0.25)",
      }}>
        <span>START</span>
        <span style={{ color: fillColor, fontWeight: 900 }}>{animPct.toFixed(0)}%</span>
        <span>END</span>
      </div>
    </div>
  );
}

/* ─────────────────────────── CYCLE ORACLE SECTION ─────────────────────────── */
function CycleSection({ cycle }: { cycle: CycleSnapshot | null }) {
  const c = cycle?.data;
  const isDeclining  = c?.phase === "declining";
  const phaseColor   = isDeclining ? "#ef4444" : "#0dd9aa";
  const phaseLabel   = isDeclining ? "DECLINING" : "ACCUMULATION";
  const phaseSub     = isDeclining ? "HIGH → LOW" : "LOW → HIGH";
  const eventColor   = c?.last_event_type === "HIGH" ? "#ef4444" : "#0dd9aa";
  const nextColor    = c?.next_event_type  === "HIGH" ? "#f97316" : "#06b6d4";
  const changePct    = c?.change_since_last ?? 0;
  const isStale      = !cycle?.updatedAt ||
    (Date.now() - new Date(cycle.updatedAt).getTime()) > 10 * 60 * 1000; // 10 min

  return (
    <div style={{
      position: "relative", zIndex: 2,
      margin: "12px 14px 14px",
      borderRadius: "18px",
      border: "1px solid rgba(255,255,255,0.08)",
      background: "linear-gradient(160deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 100%)",
      overflow: "hidden",
    }}>
      {/* accent line */}
      <div style={{
        position: "absolute", top: 0, left: "10%", right: "10%", height: "1px",
        background: `linear-gradient(90deg, transparent, ${phaseColor}55 40%, ${phaseColor}80 50%, ${phaseColor}55 60%, transparent)`,
        animation: "_bc_epulse 3s ease-in-out infinite",
      }} />

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.055)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <span style={{ fontSize: "16px" }}>₿</span>
          <span style={{
            fontSize: "11px", fontWeight: 900, letterSpacing: "0.12em",
            textTransform: "uppercase",
            background: "linear-gradient(90deg, rgba(255,255,255,0.92), rgba(255,255,255,0.5))",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            Cycle Oracle
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{
            width: "5px", height: "5px", borderRadius: "50%",
            background: isStale ? "#f5c542" : phaseColor,
            display: "inline-block",
            animation: isStale ? "none" : "_bc_blink 2s ease-in-out infinite",
          }} />
          <span style={{
            fontSize: "8px", fontWeight: 800, letterSpacing: "0.1em",
            color: isStale ? "#f5c542" : "rgba(255,255,255,0.28)",
            textTransform: "uppercase",
          }}>
            {isStale ? "OFFLINE" : "LIVE"}
          </span>
        </div>
      </div>

      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>

        {/* ── Phase + Progress ── */}
        <div style={{
          borderRadius: "14px",
          border: `1px solid ${phaseColor}28`,
          background: `linear-gradient(135deg, ${phaseColor}0d, rgba(255,255,255,0.02))`,
          padding: "14px 16px",
          display: "flex", flexDirection: "column", gap: "10px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{
                fontSize: "8px", fontWeight: 800, letterSpacing: "0.16em",
                textTransform: "uppercase", color: "rgba(255,255,255,0.25)",
                marginBottom: "5px",
              }}>
                ◉ Current Phase
              </div>
              <div style={{
                fontSize: "22px", fontWeight: 900, letterSpacing: "-0.03em",
                color: phaseColor, lineHeight: 1,
              }}>
                {c ? phaseLabel : "—"}
              </div>
              <div style={{
                fontSize: "10px", fontWeight: 600, color: `${phaseColor}70`,
                marginTop: "3px", letterSpacing: "0.06em",
              }}>
                {c ? phaseSub : "Awaiting bot data"}
              </div>
            </div>
            <div style={{
              textAlign: "right", minWidth: "80px",
            }}>
              <div style={{
                fontSize: "8px", fontWeight: 800, letterSpacing: "0.14em",
                textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
                marginBottom: "5px",
              }}>
                Progress
              </div>
              <div style={{
                fontSize: "28px", fontWeight: 900, letterSpacing: "-0.04em",
                color: phaseColor, lineHeight: 1, fontVariantNumeric: "tabular-nums",
              }}>
                {c ? `${c.cycle_pct.toFixed(0)}%` : "—"}
              </div>
              <div style={{
                fontSize: "10px", color: "rgba(255,255,255,0.28)",
                fontVariantNumeric: "tabular-nums", fontWeight: 500,
              }}>
                {c ? `${c.cycle_elapsed} / ${c.cycle_total}d` : ""}
              </div>
            </div>
          </div>

          {c && (
            <CycleProgressBar pct={c.cycle_pct} phase={c.phase} />
          )}
          {!c && (
            <div style={{
              height: "5px", borderRadius: "99px",
              background: "rgba(255,255,255,0.06)",
            }} />
          )}
        </div>

        {/* ── Last Event + Next Target ── */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px",
        }}>
          {/* Last Event */}
          <div style={{
            borderRadius: "14px",
            border: `1px solid ${eventColor}28`,
            background: `linear-gradient(135deg, ${eventColor}0d, rgba(255,255,255,0.02))`,
            padding: "13px 14px",
            display: "flex", flexDirection: "column", gap: "6px",
          }}>
            <div style={{
              fontSize: "8px", fontWeight: 800, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            }}>
              ⬤ Last Event
            </div>

            {/* HIGH / LOW badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              padding: "3px 9px", borderRadius: "7px",
              background: `${eventColor}18`, border: `1px solid ${eventColor}38`,
              alignSelf: "flex-start",
            }}>
              <span style={{
                fontSize: "13px", fontWeight: 900, color: eventColor,
                letterSpacing: "0.08em",
              }}>
                {c?.last_event_type ?? "—"}
              </span>
            </div>

            <div style={{
              fontSize: "15px", fontWeight: 900, color: "rgba(255,255,255,0.9)",
              fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
            }}>
              {c ? `$${c.last_event_price.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
            </div>
            <div style={{
              fontSize: "9px", color: "rgba(255,255,255,0.32)", fontWeight: 600,
            }}>
              {c?.last_event_date ?? ""}
            </div>
            <div style={{
              fontSize: "11px", fontWeight: 800,
              color: changePct >= 0 ? "#0dd9aa" : "#ef4444",
              fontVariantNumeric: "tabular-nums",
            }}>
              {c ? `${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}% since` : ""}
            </div>
          </div>

          {/* Next Target */}
          <div style={{
            borderRadius: "14px",
            border: `1px solid ${nextColor}28`,
            background: `linear-gradient(135deg, ${nextColor}0d, rgba(255,255,255,0.02))`,
            padding: "13px 14px",
            display: "flex", flexDirection: "column", gap: "6px",
            position: "relative", overflow: "hidden",
          }}>
            {c && c.next_event_days <= 60 && (
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: "1px",
                background: `linear-gradient(90deg, transparent, ${nextColor}99, transparent)`,
                animation: "_bc_epulse 1.8s ease-in-out infinite",
              }} />
            )}
            <div style={{
              fontSize: "8px", fontWeight: 800, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            }}>
              ◎ Next Target
            </div>

            <div style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              padding: "3px 9px", borderRadius: "7px",
              background: `${nextColor}18`, border: `1px solid ${nextColor}38`,
              alignSelf: "flex-start",
            }}>
              <span style={{
                fontSize: "13px", fontWeight: 900, color: nextColor,
                letterSpacing: "0.08em",
              }}>
                {c?.next_event_type ?? "—"}
              </span>
            </div>

            <div style={{
              fontSize: "15px", fontWeight: 900, color: "rgba(255,255,255,0.9)",
              fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
            }}>
              {c ? `${c.next_event_days}d away` : "—"}
            </div>
            <div style={{
              fontSize: "9px", color: "rgba(255,255,255,0.32)", fontWeight: 600,
            }}>
              {c?.next_event_date ?? ""}
            </div>
            {c && c.next_event_days <= 60 && (
              <div style={{
                fontSize: "10px", fontWeight: 900,
                color: nextColor, letterSpacing: "0.06em",
                animation: "_bc_epulse 1.8s ease-in-out infinite",
              }}>
                ⚠ SOON
              </div>
            )}
          </div>
        </div>

        {/* ── Disclaimer ── */}
        <div style={{
          fontSize: "9px", color: "rgba(255,255,255,0.15)", fontWeight: 500,
          letterSpacing: "0.04em", textAlign: "center",
          paddingTop: "2px",
        }}>
          Pattern-matching only · Not financial advice
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── MAIN ─────────────────────────── */
export function BtcCrashCard() {
  const [snap, setSnap]       = useState<Snapshot | null>(null);
  const [cycle, setCycle]     = useState<CycleSnapshot | null>(null);
  const [age, setAge]         = useState("");
  const [price, setPrice]     = useState<number | null>(null);
  const [flash, setFlash]     = useState<"up" | "down" | null>(null);
  const prev                  = useRef<number | null>(null);

  useEffect(() => {
    const ws = new WebSocket("wss://data-stream.binance.vision/ws/btcusdt@trade");
    ws.onmessage = (e) => {
      try {
        const p = parseFloat(JSON.parse(e.data).p);
        if (prev.current !== null && p !== prev.current) setFlash(p > prev.current ? "up" : "down");
        prev.current = p;
        setPrice(p);
      } catch {}
    };
    return () => ws.close();
  }, []);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 700); return () => clearTimeout(t); }, [flash]);

  useEffect(() => {
    let alive = true;
    const go = async () => {
      try { const r = await fetch(`${API_BASE}/api/bot/data?key=btc`); if (r.ok && alive) setSnap(await r.json()); } catch {}
    };
    go(); const id = setInterval(go, 3000); return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    let alive = true;
    const go = async () => {
      try { const r = await fetch(`${API_BASE}/api/cycle/data`); if (r.ok && alive) setCycle(await r.json()); } catch {}
    };
    go(); const id = setInterval(go, 30_000); return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!snap?.updatedAt) return;
    const id = setInterval(() => setAge(since(snap.updatedAt!)), 1000);
    setAge(since(snap.updatedAt));
    return () => clearInterval(id);
  }, [snap?.updatedAt]);

  const d          = snap?.data;
  const stage      = d?.status ?? "SAFE";
  const cfg        = STAGE[stage] ?? STAGE.SAFE;
  const isPaused   = d?.trade_mode === "Pause";

  // When paused, override the whole card's colour theme to yellow
  const displayCfg = isPaused
    ? { color: "#f5c542", colorMid: "rgba(245,197,66,0.5)", glow: "rgba(245,197,66,0.18)", border: "rgba(245,197,66,0.35)", label: "PAUSED", sub: "TRADING HALTED" }
    : cfg;

  const pauseReason = (() => {
    if (!d) return "";
    if (d.pause_reason?.trim()) return d.pause_reason.trim();
    const rows: [string, number][] = [["1m", d.drop_1m], ["5m", d.drop_5m], ["15m", d.drop_15m], ["1h", d.drop_1h], ["4h", d.drop_4h]];
    const worst = rows.reduce((a, b) => b[1] > a[1] ? b : a);
    const parts: string[] = [];
    if (worst[1] >= 1) parts.push(`BTC ${worst[0]} drop: −${worst[1].toFixed(2)}%`);
    if ((d.consec_drops ?? 0) >= 3) parts.push(`${d.consec_drops} consecutive down-minutes`);
    if (d.vol_spike) parts.push("volume spike on red candle");
    if ((d.whale_count ?? 0) >= 3) parts.push(`${d.whale_count} whale sells in 60s`);
    return parts.length ? parts.join(" · ") : "Conditions elevated — await normalization";
  })();

  const whaleCount  = d?.whale_count       ?? 0;
  const whaleUsd    = d?.whale_usd_total   ?? 0;
  const whaleBuy    = d?.whale_buy_total   ?? 0;
  const whaleNet    = d?.whale_net_flow    ?? 0;
  const whaleNetLvl = d?.whale_net_flow_level ?? "NORMAL";
  const consec      = d?.consec_drops      ?? 0;
  const volSpike    = d?.vol_spike         ?? false;
  const funding     = d?.funding_rate      ?? 0;
  const fundingLvl  = d?.funding_level     ?? "NORMAL";
  const liqUsd      = d?.liq_usd_60s       ?? 0;
  const liqLvl      = d?.liq_level         ?? "NORMAL";
  const liqLargest  = d?.liq_largest       ?? 0;

  const fundingBias   = d?.funding_bias    ?? "FLAT";
  const lowerHighs    = d?.lower_highs        ?? 0;
  const lowerHighsAlrt= d?.lower_highs_alert  ?? false;
  const netFlow5m     = d?.whale_net_flow_5m  ?? 0;
  const netFlow15m    = d?.whale_net_flow_15m ?? 0;
  const netFlow15mLvl = d?.whale_net_flow_15m_level ?? "NORMAL";
  const redCount      = d?.red_candle_count   ?? 0;
  const redTotal      = d?.red_candle_total   ?? 0;
  const redRatioAlrt  = d?.red_candle_ratio_alert ?? false;
  const volImbRatio   = d?.vol_imbalance_ratio ?? null;
  const volImbLvl     = d?.vol_imbalance_level ?? "NORMAL";

  const priceColor = flash === "up" ? "#0dd9aa" : flash === "down" ? "#ef4444" : "#0dd9aa";
  const netColor   = LVL[whaleNetLvl] ?? "#0dd9aa";
  const net15mColor = LVL[netFlow15mLvl] ?? "#0dd9aa";
  const fmtSignedK = (n: number) => `${n >= 0 ? "+" : "−"}${fmtK(Math.abs(n))}`;

  return (
    <>
      <style>{`
        @keyframes _bc_blink   { 0%,100%{opacity:1} 50%{opacity:.08} }
        @keyframes _bc_breathe { 0%,100%{opacity:.55} 50%{opacity:1} }
        @keyframes _bc_pricetick { 0%{transform:scale(1.01)} 100%{transform:scale(1)} }
        @keyframes _bc_flash_up  { 0%{text-shadow:0 0 8px #0dd9aa80} 100%{text-shadow:none} }
        @keyframes _bc_flash_dn  { 0%{text-shadow:0 0 8px #ef444480} 100%{text-shadow:none} }
        @keyframes _bc_slide_in  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes _bc_epulse    { 0%,100%{opacity:.4} 50%{opacity:1} }
      `}</style>

      <section style={{
        position: "relative",
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        borderRadius: "22px",
        overflow: "hidden",
        background: "transparent",
        border: `1px solid ${displayCfg.border}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
        transition: "border-color 0.55s ease, box-shadow 0.65s ease",
        display: "flex", flexDirection: "column",
      }}>

        {/* top accent line */}
        <div aria-hidden style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "1px",
          background: `linear-gradient(90deg, transparent, ${displayCfg.color}55 30%, ${displayCfg.color}80 50%, ${displayCfg.color}55 70%, transparent)`,
          zIndex: 5, pointerEvents: "none",
          transition: "background 0.55s ease",
        }} />


        {/* ═══════════════ HEADER ═══════════════ */}
        <div style={{
          position: "relative", zIndex: 2,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px",
          flexWrap: "wrap", gap: "12px",
          borderBottom: "1px solid rgba(255,255,255,0.055)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "13px" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <CoinIcon symbol="BTC" size={42} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "3px" }}>
                <span style={{
                  fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
                  fontSize: "13.2px", fontWeight: 900,
                  letterSpacing: "0.02em",
                  textTransform: "uppercase",
                  background: "linear-gradient(90deg, rgba(255,255,255,0.92), rgba(255,255,255,0.5))",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>
                  BTC MONITOR
                </span>
              </div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", fontWeight: 500 }}>
                {d ? `updated ${age}` : "waiting for bot data…"}
              </div>
            </div>
          </div>

          {/* status badge */}
          <div style={{
            padding: "9px 18px", borderRadius: "12px",
            background: `linear-gradient(135deg, ${displayCfg.color}18, ${displayCfg.color}07)`,
            border: `1px solid ${displayCfg.border}`,
            boxShadow: `inset 0 1px 0 ${displayCfg.color}15`,
            display: "flex", flexDirection: "column", alignItems: "center",
            transition: "all 0.55s ease", minWidth: "88px",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "7px",
              fontSize: "12px", fontWeight: 900, letterSpacing: "0.1em",
              color: displayCfg.color,
              textTransform: "uppercase",
            }}>
              <span style={{
                width: "7px", height: "7px", borderRadius: "50%",
                background: displayCfg.color,
                animation: "_bc_blink 1.8s ease-in-out infinite",
              }} />
              {d ? displayCfg.label : "OFFLINE"}
            </div>
            {d && (
              <div style={{
                fontSize: "7px", fontWeight: 700, marginTop: "2px",
                color: `${displayCfg.color}75`, letterSpacing: "0.1em", textTransform: "uppercase",
              }}>
                {displayCfg.sub}
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════ PRICE HERO ═══════════════ */}
        <div style={{
          position: "relative", zIndex: 2,
          padding: "20px 20px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.016) 0%, transparent 100%)",
        }}>
          <div style={{
            fontSize: "9px", fontWeight: 700, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.2)",
            marginBottom: "8px",
          }}>
            Bitcoin · Live Price
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
            <span
              key={String(flash)}
              style={{
                fontSize: "40px", fontWeight: 900, lineHeight: 1,
                fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em",
                color: priceColor,
                transition: "color 0.4s ease",
                animation: flash === "up"
                  ? "_bc_flash_up 0.7s ease both, _bc_pricetick 0.25s ease both"
                  : flash === "down"
                  ? "_bc_flash_dn 0.7s ease both, _bc_pricetick 0.25s ease both"
                  : "none",
                textShadow: "none",
              }}
            >
              {price ? `$${fmt2(price)}` : "—"}
            </span>
            {/* arrow */}
            <div style={{ opacity: flash ? 1 : 0.2, transition: "opacity 0.4s" }}>
              <svg width="18" height="26" viewBox="0 0 18 26" fill="none">
                <path
                  d={flash === "down" ? "M9 22 L2 10 L16 10 Z" : "M9 4 L16 16 L2 16 Z"}
                  fill={flash === "down" ? "#ef4444" : "#0dd9aa"}
                  style={{ filter: "none" }}
                />
              </svg>
            </div>
          </div>

          {/* Stat strip */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            borderRadius: "12px", overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(0,0,0,0.22)",
          }}>
            {[
              {
                label: "SPEED",
                value: !d ? "—" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%`,
                unit: "/min",
                color: !d ? "rgba(255,255,255,0.16)" : d.speed > 0 ? "#0dd9aa" : d.speed < 0 ? "#ef4444" : "rgba(255,255,255,0.4)",
              },
              {
                label: "VOLATILITY",
                value: !d ? "—" : `${d.volatility.toFixed(2)}%`,
                color: !d ? "rgba(255,255,255,0.16)" : d.volatility >= 4 ? "#ef4444" : d.volatility >= 2.5 ? "#f97316" : "rgba(255,255,255,0.7)",
              },
              {
                label: "CONSEC DROPS",
                value: !d ? "—" : String(consec),
                color: !d ? "rgba(255,255,255,0.16)" : consec >= 5 ? "#ef4444" : consec >= 3 ? "#f97316" : "rgba(255,255,255,0.7)",
              },
              {
                label: "↑ VOL SPIKE",
                value: !d ? "—" : volSpike ? "YES" : "NO",
                color: !d ? "rgba(255,255,255,0.16)" : volSpike ? "#ef4444" : "#0dd9aa",
              },
            ].map(({ label, value, unit, color }, i) => (
              <div key={label} style={{
                padding: "10px 12px",
                borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
              }}>
                <div style={{
                  fontSize: "7.5px", fontWeight: 700, letterSpacing: "0.14em",
                  textTransform: "uppercase", color: "rgba(255,255,255,0.2)", marginBottom: "4px",
                }}>{label}</div>
                <div style={{
                  fontSize: "14px", fontWeight: 900,
                  fontVariantNumeric: "tabular-nums", color,
                  letterSpacing: "-0.01em",
                  textShadow: "none",
                }}>
                  {value}
                  {unit && <span style={{ fontSize: "9px", marginLeft: "1px", color: `${color}80` }}>{unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════════ PRESSURE / DROP ═══════════════ */}
        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{
            display: "grid", gridTemplateColumns: "36px 1fr 90px 68px",
            padding: "10px 20px 6px", gap: "8px",
          }}>
            {["", "PRESSURE", "PEAK", "DROP"].map((h, i) => (
              <span key={i} style={{
                fontSize: "7.5px", fontWeight: 700, letterSpacing: "0.15em",
                textTransform: "uppercase", color: "rgba(255,255,255,0.17)",
                textAlign: i >= 2 ? "right" : "left",
              }}>{h}</span>
            ))}
          </div>

          {TF_ROWS.map(({ t, dk, pk }, idx) => {
            const pct  = d ? (d[dk] as number) : 0;
            const peak = d ? (d[pk] as number) : null;
            const col  = d ? dropCol(pct) : "rgba(255,255,255,0.1)";
            return (
              <div
                key={t}
                style={{
                  display: "grid", gridTemplateColumns: "36px 1fr 90px 68px",
                  gap: "8px", alignItems: "center",
                  padding: "7px 20px",
                  borderTop: "1px solid rgba(255,255,255,0.038)",
                  transition: "background 0.15s", cursor: "default",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.022)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{
                  fontSize: "11px", fontWeight: 800,
                  color: "rgba(255,255,255,0.32)", fontVariantNumeric: "tabular-nums",
                }}>{t}</span>

                <PressureBars pct={pct} inactive={!d} />

                <span style={{
                  fontSize: "11px", fontWeight: 500, fontVariantNumeric: "tabular-nums",
                  color: d ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.09)", textAlign: "right",
                }}>
                  {d && peak ? `$${fmt2(peak)}` : "—"}
                </span>

                <span style={{
                  fontSize: "14px", fontWeight: 900, fontVariantNumeric: "tabular-nums",
                  color: col, textAlign: "right", letterSpacing: "-0.01em",
                  textShadow: "none",
                }}>
                  {d ? `-${pct.toFixed(2)}%` : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {/* ═══════════════ SIGNAL CARDS ═══════════════ */}
        <div style={{
          position: "relative", zIndex: 2,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: "8px", padding: "14px 14px 0",
          borderTop: "1px solid rgba(255,255,255,0.055)",
        }}>
          {(() => {
            const lvl = !d ? "NORMAL" : whaleCount >= 3 ? "DANGER" : whaleCount >= 1 ? "WATCH" : "NORMAL";
            return (
              <SigCard icon="≋" title="Whale Sells"
                value={!d ? "—" : `${whaleCount} txn`}
                sub={d && whaleUsd > 0 ? `${fmtK(whaleUsd)} total` : d ? "$0 total" : undefined}
                lvlColor={LVL[lvl]} level={d ? lvl : undefined}
                danger={lvl === "DANGER" || lvl === "RISK"}
              />
            );
          })()}
          <SigCard icon="↗" title="Funding"
            value={!d ? "—" : fmtFnd(funding)}
            sub={d && fundingBias !== "FLAT" ? `${fundingBias} crowd` : undefined}
            lvlColor={LVL[fundingLvl]} level={d ? fundingLvl : undefined}
            danger={fundingLvl === "DANGER"}
          />
          <SigCard icon="↯" title="Liquidations"
            value={!d ? "—" : fmtK(liqUsd)}
            sub={d && liqLargest > 0 ? `largest ${fmtK(liqLargest)}` : undefined}
            lvlColor={LVL[liqLvl]} level={d ? liqLvl : undefined}
            danger={liqLvl === "DANGER"}
          />
          <SigCard icon="⌄" title="Lower Highs"
            value={!d ? "—" : String(lowerHighs)}
            sub={d ? (lowerHighsAlrt ? "bearish structure" : "consecutive") : undefined}
            lvlColor={lowerHighsAlrt ? "#ef4444" : "#0dd9aa"}
            level={d ? (lowerHighsAlrt ? "DANGER" : "NORMAL") : undefined}
            danger={lowerHighsAlrt}
          />
          <SigCard icon="▽" title="Red Candles"
            value={!d ? "—" : `${redCount}/${redTotal || 20}`}
            sub={d ? (redRatioAlrt ? "ratio alert" : "last 20 candles") : undefined}
            lvlColor={redRatioAlrt ? "#ef4444" : "#0dd9aa"}
            level={d ? (redRatioAlrt ? "DANGER" : "NORMAL") : undefined}
            danger={redRatioAlrt}
          />
          <SigCard icon="⇄" title="Vol Imbalance"
            value={!d ? "—" : volImbRatio == null ? "—" : `${volImbRatio.toFixed(2)}x`}
            sub={d ? "sell/buy · 15m" : undefined}
            lvlColor={LVL[volImbLvl]} level={d ? volImbLvl : undefined}
            danger={volImbLvl === "DANGER"}
          />
        </div>

        {/* ═══════════════ NET FLOW ROW ═══════════════ */}
        <div style={{
          position: "relative", zIndex: 2,
          margin: "12px 14px",
          padding: "14px 18px",
          borderRadius: "14px",
          background: `linear-gradient(135deg, ${netColor}09, rgba(255,255,255,0.022))`,
          border: `1px solid ${netColor}28`,
          boxShadow: "none",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: "10px",
          transition: "all 0.45s ease",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{
              fontSize: "9px", fontWeight: 800, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.27)",
            }}>
              $ Whale Net Flow
            </span>
            {d && (
              <div style={{ display: "flex", gap: "6px" }}>
                <span style={{
                  fontSize: "9px", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                  padding: "2px 7px", borderRadius: "5px",
                  background: "rgba(13,217,170,0.1)", color: "#0dd9aa",
                }}>B {fmtK(whaleBuy)}</span>
                <span style={{
                  fontSize: "9px", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                  padding: "2px 7px", borderRadius: "5px",
                  background: "rgba(239,68,68,0.1)", color: "#ef4444",
                }}>S {fmtK(whaleUsd)}</span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{
              fontSize: "24px", fontWeight: 900, fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em", color: netColor,
              textShadow: "none",
            }}>
              {!d ? "—" : `${whaleNet >= 0 ? "+" : "−"}${fmtK(Math.abs(whaleNet))}`}
            </span>
            {d && whaleNet !== 0 && (
              <span style={{
                fontSize: "9px", fontWeight: 600, color: "rgba(255,255,255,0.28)",
                letterSpacing: "0.04em",
              }}>
                {whaleNet < 0 ? "SELL pressure" : "BUY pressure"}
              </span>
            )}
            {d && <LvlBadge level={whaleNetLvl} />}
          </div>
        </div>

        {/* ═══════════════ NET FLOW WINDOWS (5m / 15m) ═══════════════ */}
        <div style={{
          position: "relative", zIndex: 2,
          margin: "-4px 14px 12px",
          padding: "10px 18px",
          borderRadius: "14px",
          background: "rgba(255,255,255,0.022)",
          border: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: "10px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            }}>5M</span>
            <span style={{
              fontSize: "12px", fontWeight: 800, fontVariantNumeric: "tabular-nums",
              color: !d ? "rgba(255,255,255,0.16)" : netFlow5m < 0 ? "#ef4444" : "#0dd9aa",
            }}>{!d ? "—" : fmtSignedK(netFlow5m)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
              textTransform: "uppercase", color: "rgba(255,255,255,0.22)",
            }}>15M</span>
            <span style={{
              fontSize: "12px", fontWeight: 800, fontVariantNumeric: "tabular-nums",
              color: !d ? "rgba(255,255,255,0.16)" : net15mColor,
            }}>{!d ? "—" : fmtSignedK(netFlow15m)}</span>
            {d && <LvlBadge level={netFlow15mLvl} />}
          </div>
        </div>

        {/* ═══════════════ PAUSED BANNER ═══════════════ */}
        {isPaused && (
          <div style={{
            position: "relative", zIndex: 2,
            margin: "0 14px 14px",
            padding: "14px 18px",
            borderRadius: "14px",
            background: "linear-gradient(135deg, rgba(245,197,66,0.11), rgba(245,197,66,0.04))",
            border: "1px solid rgba(245,197,66,0.30)",
            boxShadow: "inset 0 1px 0 rgba(245,197,66,0.10)",
            display: "flex", alignItems: "center", gap: "14px",
            animation: "_bc_slide_in 0.35s ease both",
          }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(245,197,66,0.22), rgba(245,197,66,0.08))",
              border: "1.5px solid rgba(245,197,66,0.42)",
              boxShadow: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="#f5c542">
                <rect x="2" y="2" width="3.5" height="10" rx="1.2" />
                <rect x="8.5" y="2" width="3.5" height="10" rx="1.2" />
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                <span style={{
                  fontSize: "11px", fontWeight: 900, color: "#f5c542",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  textShadow: "none",
                }}>
                  Trading Paused
                </span>
                <span style={{
                  padding: "2px 7px", borderRadius: "4px",
                  background: "rgba(245,197,66,0.15)", border: "1px solid rgba(245,197,66,0.35)",
                  fontSize: "7px", fontWeight: 900, color: "#f5c542",
                  letterSpacing: "0.12em", textTransform: "uppercase",
                }}>
                  BOT HALTED
                </span>
              </div>
              <div style={{
                fontSize: "11px", lineHeight: 1.65,
                color: "rgba(245,197,66,0.58)", wordBreak: "break-word",
              }}>
                {pauseReason}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ BITCOIN CYCLE ORACLE ═══════════════ */}
        <CycleSection cycle={cycle} />

        {/* bottom shimmer */}
        <div aria-hidden style={{
          height: "1px",
          background: `linear-gradient(90deg, transparent, ${displayCfg.color}28, transparent)`,
          transition: "background 0.55s",
        }} />
      </section>
    </>
  );
}
