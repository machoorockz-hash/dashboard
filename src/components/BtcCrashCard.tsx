import { useEffect, useRef, useState } from "react";
import { CoinIcon } from "./CoinIcon";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/* ══════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════ */
interface BotData {
  price: number;
  drop_1m: number; drop_5m: number; drop_15m: number; drop_1h: number; drop_4h: number;
  peak_1m: number; peak_5m: number; peak_15m: number; peak_1h: number; peak_4h: number;
  speed: number; volatility: number; status: string; trade_mode?: string;
  pause_reason?: string;
  whale_count?: number; whale_usd_total?: number; whale_buy_total?: number;
  whale_net_flow?: number; whale_net_flow_level?: string;
  consec_drops?: number; vol_spike?: boolean;
  funding_rate?: number; funding_level?: string;
  liq_usd_60s?: number; liq_level?: string; liq_largest?: number;
}
interface Snapshot { key: string; updatedAt: string | null; data: BotData | null; }

/* ══════════════════════════════════════════════════
   CONFIG
══════════════════════════════════════════════════ */
const STAGES = ["SAFE", "WATCH", "RISK", "SELL_ALERT", "DANGER"] as const;
type Stage = typeof STAGES[number];

const STAGE_CFG: Record<Stage, { color: string; bg: string; label: string }> = {
  SAFE:       { color: "#22d3a5", bg: "rgba(34,211,165,0.12)",  label: "SAFE" },
  WATCH:      { color: "#f5c542", bg: "rgba(245,197,66,0.12)",  label: "WATCH" },
  RISK:       { color: "#f97316", bg: "rgba(249,115,22,0.12)",  label: "RISK" },
  SELL_ALERT: { color: "#f87171", bg: "rgba(248,113,113,0.12)", label: "ALERT" },
  DANGER:     { color: "#ef4444", bg: "rgba(239,68,68,0.14)",   label: "DANGER" },
};

const LVL: Record<string, string> = {
  NORMAL: "#22d3a5", WATCH: "#f5c542", RISK: "#f97316", DANGER: "#ef4444",
};

const TF = [
  { t: "1m",  d: "drop_1m"  as keyof BotData, p: "peak_1m"  as keyof BotData },
  { t: "5m",  d: "drop_5m"  as keyof BotData, p: "peak_5m"  as keyof BotData },
  { t: "15m", d: "drop_15m" as keyof BotData, p: "peak_15m" as keyof BotData },
  { t: "1h",  d: "drop_1h"  as keyof BotData, p: "peak_1h"  as keyof BotData },
  { t: "4h",  d: "drop_4h"  as keyof BotData, p: "peak_4h"  as keyof BotData },
];

/* ══════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════ */
const fmt2 = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtK = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `$${(n / 1_000).toFixed(0)}K`
  : `$${n.toFixed(0)}`;

const fmtFund = (r: number) =>
  `${r >= 0 ? "+" : ""}${(r * 100).toFixed(4)}%`;

function timeSince(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 5 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ${s % 60}s ago`;
}

function dropCol(pct: number) {
  return pct >= 4 ? "#ef4444" : pct >= 2 ? "#f97316" : pct >= 1 ? "#f5c542" : "#22d3a5";
}

/* ══════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════ */
export function BtcCrashCard() {
  const [snap, setSnap]           = useState<Snapshot | null>(null);
  const [age, setAge]             = useState("");
  const [price, setPrice]         = useState<number | null>(null);
  const [flash, setFlash]         = useState<"up" | "down" | null>(null);
  const prev                      = useRef<number | null>(null);

  /* live price */
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
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 500); return () => clearTimeout(t); }, [flash]);

  /* bot poll */
  useEffect(() => {
    let alive = true;
    async function go() {
      try { const r = await fetch(`${API_BASE}/api/bot/data?key=btc`); if (r.ok && alive) setSnap(await r.json()); } catch {}
    }
    go(); const id = setInterval(go, 3000); return () => { alive = false; clearInterval(id); };
  }, []);
  useEffect(() => {
    if (!snap?.updatedAt) return;
    const id = setInterval(() => setAge(timeSince(snap.updatedAt!)), 1000);
    setAge(timeSince(snap.updatedAt));
    return () => clearInterval(id);
  }, [snap?.updatedAt]);

  /* derived */
  const d        = snap?.data;
  const stage    = (d?.status ?? "SAFE") as Stage;
  const cfg      = STAGE_CFG[stage] ?? STAGE_CFG.SAFE;
  const stageIdx = STAGES.indexOf(stage);
  const isPaused = d?.trade_mode === "Pause";

  const pauseReason = (() => {
    if (!d) return "";
    if (d.pause_reason?.trim()) return d.pause_reason.trim();
    const parts: string[] = [];
    [["1m", d.drop_1m], ["5m", d.drop_5m], ["15m", d.drop_15m], ["1h", d.drop_1h], ["4h", d.drop_4h]]
      .reduce((a: any, b: any) => b[1] > a[1] ? b : a);
    const worst = (
      [["1m", d.drop_1m], ["5m", d.drop_5m], ["15m", d.drop_15m], ["1h", d.drop_1h], ["4h", d.drop_4h]] as [string, number][]
    ).reduce((a, b) => b[1] > a[1] ? b : a);
    if (worst[1] >= 1) parts.push(`${worst[0]} drop −${worst[1].toFixed(2)}%`);
    if ((d.consec_drops ?? 0) >= 3) parts.push(`${d.consec_drops} consecutive red minutes`);
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

  const priceCol =
    flash === "up" ? "#22d3a5" : flash === "down" ? "#ef4444" : "#F7931A";

  /* ────── render ────── */
  return (
    <>
      <style>{`
        @keyframes _cm_blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes _cm_rise  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        @keyframes _cm_price_up   { 0%{color:#22d3a5} 100%{color:inherit} }
        @keyframes _cm_price_down { 0%{color:#ef4444} 100%{color:inherit} }
        ._cm_dot  { animation: _cm_blink 2s ease-in-out infinite; }
        ._cm_in   { animation: _cm_rise  0.28s ease both; }
      `}</style>

      <div style={{
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
        borderRadius: "20px",
        overflow: "hidden",
        background: "#080e1c",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
        display: "flex",
        flexDirection: "column",
      }}>

        {/* ══════════════════════════
            TOP BAND — colored by status
        ══════════════════════════ */}
        <div style={{
          height: "3px",
          background: `linear-gradient(90deg, ${cfg.color}00 0%, ${cfg.color} 30%, ${cfg.color} 70%, ${cfg.color}00 100%)`,
        }} />

        {/* ══════════════════════════
            HEADER
        ══════════════════════════ */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 20px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <CoinIcon symbol="BTC" size={36} />
            <div>
              <div style={{
                fontSize: "14px", fontWeight: 700,
                color: "rgba(255,255,255,0.9)", letterSpacing: "-0.01em",
              }}>
                BTC Crash Monitor
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: "5px",
                fontSize: "10px", color: "rgba(255,255,255,0.25)", marginTop: "2px",
              }}>
                <span className="_cm_dot" style={{
                  display: "inline-block", width: "5px", height: "5px",
                  borderRadius: "50%", background: d ? cfg.color : "rgba(255,255,255,0.2)",
                  boxShadow: d ? `0 0 5px ${cfg.color}` : "none",
                }} />
                {d ? `updated ${age}` : "waiting for bot"}
              </div>
            </div>
          </div>

          {/* Status pill */}
          <div style={{
            padding: "6px 14px", borderRadius: "999px",
            background: cfg.bg,
            border: `1px solid ${cfg.color}35`,
            color: cfg.color,
            fontSize: "10px", fontWeight: 800,
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            {d ? cfg.label : "OFFLINE"}
          </div>
        </div>

        {/* ══════════════════════════
            PRICE HERO
        ══════════════════════════ */}
        <div style={{
          padding: "22px 20px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.015) 0%, transparent 100%)",
        }}>
          <div style={{
            fontSize: "9px", fontWeight: 600, letterSpacing: "0.16em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.2)",
            marginBottom: "6px",
          }}>
            Bitcoin · Live Price
          </div>
          <div style={{
            fontSize: "48px", fontWeight: 800,
            letterSpacing: "-0.04em", lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            color: priceCol,
            transition: "color 0.4s ease",
            textShadow: flash ? `0 0 40px ${priceCol}40` : "none",
          }}>
            {price ? `$${fmt2(price)}` : "—"}
          </div>

          {/* Speed + Vol row */}
          <div style={{
            display: "flex", gap: "20px", marginTop: "14px",
          }}>
            {[
              {
                label: "Speed · 10s",
                value: !d ? "—" : `${d.speed > 0 ? "+" : ""}${d.speed.toFixed(2)}%`,
                color: !d ? "rgba(255,255,255,0.2)"
                  : d.speed > 0 ? "#22d3a5"
                  : d.speed < 0 ? "#ef4444"
                  : "rgba(255,255,255,0.35)",
              },
              {
                label: "Volatility · 10s",
                value: !d ? "—" : `${d.volatility.toFixed(2)}%`,
                color: !d ? "rgba(255,255,255,0.2)"
                  : d.volatility >= 4 ? "#ef4444"
                  : d.volatility >= 2.5 ? "#f97316"
                  : "#22d3a5",
              },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{
                  fontSize: "9px", fontWeight: 600, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: "rgba(255,255,255,0.2)",
                  marginBottom: "3px",
                }}>{label}</div>
                <div style={{
                  fontSize: "18px", fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  color, letterSpacing: "-0.02em",
                }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ══════════════════════════
            RISK METER — 5 segments
        ══════════════════════════ */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{
            fontSize: "9px", fontWeight: 600, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.2)",
            marginBottom: "10px",
          }}>
            Risk Level
          </div>
          <div style={{ display: "flex", gap: "5px" }}>
            {STAGES.map((s, i) => {
              const c   = STAGE_CFG[s].color;
              const act = d && i === stageIdx;
              const lit = d && i <= stageIdx;
              return (
                <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", gap: "5px" }}>
                  <div style={{
                    height: "5px", borderRadius: "999px",
                    background: lit ? c : "rgba(255,255,255,0.07)",
                    boxShadow: act ? `0 0 10px ${c}` : "none",
                    transition: "background 0.4s ease, box-shadow 0.4s ease",
                  }} />
                  <div style={{
                    fontSize: "8px", fontWeight: act ? 800 : 500,
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    color: act ? c : "rgba(255,255,255,0.18)",
                    textAlign: "center",
                    transition: "color 0.3s ease",
                  }}>
                    {STAGE_CFG[s].label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Status text */}
          {d && (
            <div className="_cm_in" style={{
              marginTop: "10px",
              fontSize: "11px", fontWeight: 500,
              color: cfg.color, lineHeight: 1.5,
            }}>
              {["SAFE — OK to trade alts", "WATCH — Be selective", "RISK — Hold off new buys", "SELL ALERT — Pause buying", "DANGER — Consider selling"][stageIdx]}
            </div>
          )}
        </div>

        {/* ══════════════════════════
            PAUSED BANNER
        ══════════════════════════ */}
        {isPaused && (
          <div className="_cm_in" style={{
            margin: "0 16px",
            borderRadius: "10px",
            border: "1px solid rgba(245,197,66,0.25)",
            background: "rgba(245,197,66,0.06)",
            padding: "12px 14px",
            display: "flex", gap: "10px", alignItems: "flex-start",
            marginBottom: "0",
          }}>
            <div style={{
              fontSize: "12px", flexShrink: 0, marginTop: "1px",
              color: "#f5c542",
            }}>⏸</div>
            <div>
              <div style={{
                fontSize: "10px", fontWeight: 700, color: "#f5c542",
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}>Trading Paused</div>
              <div style={{
                fontSize: "11px", color: "rgba(245,197,66,0.65)",
                marginTop: "4px", lineHeight: 1.55,
              }}>{pauseReason}</div>
            </div>
          </div>
        )}

        {/* ══════════════════════════
            DROP TABLE
        ══════════════════════════ */}
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{
            fontSize: "9px", fontWeight: 600, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.2)",
            marginBottom: "10px",
          }}>
            Drop from Peak
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {TF.map(({ t, d: dk, p: pk }) => {
              const pct  = d ? (d[dk] as number) : 0;
              const peak = d ? (d[pk] as number) : null;
              const col  = d ? dropCol(pct) : "rgba(255,255,255,0.12)";
              const bar  = d ? Math.min(pct / 6, 1) : 0;
              return (
                <div
                  key={t}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "28px 1fr 64px 90px",
                    alignItems: "center",
                    padding: "8px 10px",
                    borderRadius: "8px",
                    gap: "8px",
                    cursor: "default",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {/* TF label */}
                  <span style={{
                    fontSize: "10px", fontWeight: 700,
                    color: "rgba(255,255,255,0.3)",
                    fontVariantNumeric: "tabular-nums",
                  }}>{t}</span>

                  {/* bar track */}
                  <div style={{
                    height: "4px", borderRadius: "999px",
                    background: "rgba(255,255,255,0.06)",
                    position: "relative", overflow: "hidden",
                  }}>
                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: `${bar * 100}%`,
                      borderRadius: "999px",
                      background: col,
                      boxShadow: d && pct >= 1 ? `0 0 6px ${col}80` : "none",
                      transition: "width 0.6s ease",
                    }} />
                  </div>

                  {/* drop pct */}
                  <span style={{
                    fontSize: "11px", fontWeight: 800,
                    fontVariantNumeric: "tabular-nums",
                    color: col, textAlign: "right",
                  }}>
                    {d ? `-${pct.toFixed(2)}%` : "—"}
                  </span>

                  {/* peak price */}
                  <span style={{
                    fontSize: "10px", fontWeight: 500,
                    fontVariantNumeric: "tabular-nums",
                    color: "rgba(255,255,255,0.2)", textAlign: "right",
                  }}>
                    {d && peak ? `$${fmt2(peak)}` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ══════════════════════════
            MARKET SIGNALS
        ══════════════════════════ */}
        <div style={{ padding: "16px 20px 20px" }}>
          <div style={{
            fontSize: "9px", fontWeight: 600, letterSpacing: "0.14em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.2)",
            marginBottom: "4px",
          }}>
            Market Signals
          </div>

          {[
            {
              label: "Liquidations · 60s",
              value: !d ? "—" : fmtK(liqUsd),
              sub: d && liqLargest > 0 ? `Largest: ${fmtK(liqLargest)}` : undefined,
              level: d ? liqLvl : undefined,
              color: !d ? "rgba(255,255,255,0.2)" : LVL[liqLvl] ?? "#22d3a5",
            },
            {
              label: "Funding Rate",
              value: !d ? "—" : fmtFund(funding),
              level: d ? fundingLvl : undefined,
              color: !d ? "rgba(255,255,255,0.2)" : LVL[fundingLvl] ?? "#22d3a5",
            },
            {
              label: "Whale Sells · 60s",
              value: !d ? "—" : `${whaleCount}`,
              sub: d && whaleUsd > 0 ? fmtK(whaleUsd) : undefined,
              extra: whaleCount >= 3 ? "cluster alert" : undefined,
              color: !d ? "rgba(255,255,255,0.2)"
                : whaleCount >= 3 ? "#ef4444"
                : whaleCount >= 1 ? "#f97316"
                : "#22d3a5",
            },
            {
              label: "Consecutive Red Mins",
              value: !d ? "—" : `${consec}`,
              extra: consec >= 5 ? "slow bleed" : undefined,
              color: !d ? "rgba(255,255,255,0.2)"
                : consec >= 5 ? "#ef4444"
                : consec >= 3 ? "#f97316"
                : consec >= 1 ? "#f5c542"
                : "#22d3a5",
            },
            {
              label: "Net Whale Flow · 60s",
              value: !d ? "—" : `${whaleNet >= 0 ? "▲" : "▼"} ${fmtK(Math.abs(whaleNet))}`,
              sub: d ? `Buy ${fmtK(whaleBuy)}  ·  Sell ${fmtK(whaleUsd)}` : undefined,
              level: d ? whaleNetLvl : undefined,
              color: !d ? "rgba(255,255,255,0.2)" : LVL[whaleNetLvl] ?? "#22d3a5",
            },
            {
              label: "Volume Spike · Red Candle",
              value: !d ? "—" : volSpike ? "SPIKE" : "Normal",
              color: !d ? "rgba(255,255,255,0.2)" : volSpike ? "#ef4444" : "#22d3a5",
              pulse: volSpike,
            },
          ].map((row, i, arr) => (
            <div
              key={row.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 10px",
                borderRadius: "8px",
                borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                transition: "background 0.15s",
                gap: "12px",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {/* left */}
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: "10px", fontWeight: 500,
                  color: "rgba(255,255,255,0.38)",
                  letterSpacing: "0.01em",
                }}>{row.label}</div>
                {(row as any).sub && (
                  <div style={{
                    fontSize: "9px", color: "rgba(255,255,255,0.2)",
                    marginTop: "2px", fontVariantNumeric: "tabular-nums",
                  }}>{(row as any).sub}</div>
                )}
                {(row as any).extra && (
                  <div style={{
                    fontSize: "9px", fontWeight: 700,
                    color: row.color, marginTop: "2px",
                    letterSpacing: "0.06em", textTransform: "uppercase",
                  }}>{(row as any).extra}</div>
                )}
              </div>

              {/* right */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                {/* level badge */}
                {(row as any).level && (
                  <span style={{
                    fontSize: "8px", fontWeight: 800,
                    letterSpacing: "0.1em", textTransform: "uppercase",
                    padding: "2px 7px", borderRadius: "4px",
                    background: `${row.color}15`,
                    border: `1px solid ${row.color}30`,
                    color: row.color,
                  }}>
                    {(row as any).level}
                  </span>
                )}

                {/* value */}
                <span style={{
                  fontSize: "14px", fontWeight: 800,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.01em",
                  color: row.color,
                  textShadow: (row as any).pulse ? `0 0 12px ${row.color}` : "none",
                  animation: (row as any).pulse ? "_cm_blink 1s ease-in-out infinite" : "none",
                }}>
                  {row.value}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* bottom accent strip */}
        <div style={{
          height: "1px",
          background: `linear-gradient(90deg, transparent, ${cfg.color}30, transparent)`,
        }} />
      </div>
    </>
  );
}
