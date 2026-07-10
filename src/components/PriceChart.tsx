import { useEffect, useRef, useState } from "react";
import {
  createChart, CandlestickSeries, LineSeries,
  type IChartApi, type ISeriesApi, type CandlestickData,
  type LineData, type UTCTimestamp, type IPriceLine,
  CrosshairMode, LineStyle, LastPriceAnimationMode,
} from "lightweight-charts";
import { Search } from "lucide-react";
import { getKlines } from "../lib/binance";
import { CoinIcon } from "./CoinIcon";

type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
export const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

function ema(values: number[], period: number): (number | undefined)[] {
  const k = 2 / (period + 1);
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  let prev: number | undefined, sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      sum += values[i];
      if (i === period - 1) { prev = sum / period; out[i] = prev; }
      continue;
    }
    prev = values[i] * k + (prev as number) * (1 - k);
    out[i] = prev;
  }
  return out;
}

function precisionFor(price: number) {
  if (!price || price >= 1000) return { precision: 2, minMove: 0.01 };
  if (price >= 100)  return { precision: 3, minMove: 0.001 };
  if (price >= 1)    return { precision: 4, minMove: 0.0001 };
  if (price >= 0.01) return { precision: 5, minMove: 0.00001 };
  if (price >= 0.0001) return { precision: 6, minMove: 0.000001 };
  return { precision: 8, minMove: 0.00000001 };
}

function fmtPrice(p: number) {
  if (!p || !isFinite(p)) return "…";
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (p >= 1)    return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toFixed(6);
}

interface PriceLineSpec { price: number; label: string; color: string; }
interface Props {
  symbol: string; interval?: Interval; height?: number;
  onIntervalChange?: (i: Interval) => void; onSymbolChange?: (s: string) => void;
  showIntervalControls?: boolean; searchable?: boolean; priceLines?: PriceLineSpec[];
}

// ─── Overlay line config ────────────────────────────────────────────────────
interface OverlayLine {
  ref: React.RefObject<HTMLDivElement | null>;
  price: number;
  type: "live" | "entry" | "tp" | "sl";
  label: string;
}

export function PriceChart({
  symbol, interval = "1m", height = 460,
  onIntervalChange, onSymbolChange,
  showIntervalControls = true, searchable = false, priceLines,
}: Props) {
  const chartWrapRef  = useRef<HTMLDivElement>(null);
  const overlayRef    = useRef<HTMLDivElement>(null);
  const chartRef      = useRef<IChartApi | null>(null);
  const candleRef     = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema200Ref     = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Ref      = useRef<ISeriesApi<"Line"> | null>(null);
  const ema9Ref       = useRef<ISeriesApi<"Line"> | null>(null);
  const candlesRef    = useRef<CandlestickData[]>([]);
  const chartLinesRef = useRef<IPriceLine[]>([]);

  // overlay line DOM refs
  const liveLineRef   = useRef<HTMLDivElement>(null);
  const entryLineRef  = useRef<HTMLDivElement>(null);
  const tpLineRef     = useRef<HTMLDivElement>(null);
  const slLineRef     = useRef<HTMLDivElement>(null);

  const livePriceRef  = useRef<number | null>(null);
  const [iv, setIv]   = useState<Interval>(interval);
  const [search, setSearch] = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [flash, setFlash]   = useState<"up" | "down" | null>(null);
  const base = symbol.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, "");

  useEffect(() => setIv(interval), [interval]);

  // ── Chart init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!chartWrapRef.current) return;
    const chart = createChart(chartWrapRef.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#a3b1c2",
        fontFamily: "ui-sans-serif,system-ui",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.06)", scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        timeVisible: true, secondsVisible: false,
        rightOffset: 8, barSpacing: 12, minBarSpacing: 4,
      },
      crosshair: { mode: CrosshairMode.Normal },
    });
    chartRef.current = chart;
    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor:            "rgba(0, 208, 160, 0.55)",
      borderUpColor:      "#00d4a0",
      wickUpColor:        "#00d4a0",
      downColor:          "rgba(255, 45, 95, 0.55)",
      borderDownColor:    "#ff2d5f",
      wickDownColor:      "#ff2d5f",
      lastPriceAnimation: LastPriceAnimationMode.Continuous,
    });
    ema200Ref.current = chart.addSeries(LineSeries, { color: "rgba(255,255,255,0.7)", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    ema21Ref.current  = chart.addSeries(LineSeries, { color: "#3b82f6",              lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    ema9Ref.current   = chart.addSeries(LineSeries, { color: "#facc15",              lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  function recomputeEMAs() {
    const closes = candlesRef.current.map((c) => c.close);
    const times  = candlesRef.current.map((c) => c.time as UTCTimestamp);
    for (const [s, period] of [
      [ema200Ref.current, 200], [ema21Ref.current, 21], [ema9Ref.current, 9],
    ] as [ISeriesApi<"Line"> | null, number][]) {
      if (!s) continue;
      const vals = ema(closes, period);
      const line: LineData[] = [];
      for (let i = 0; i < vals.length; i++)
        if (vals[i] !== undefined) line.push({ time: times[i], value: vals[i] as number });
      s.setData(line);
    }
  }

  // ── Price lines (Entry / TP / SL) ─────────────────────────────────────────
  useEffect(() => {
    const series = candleRef.current; if (!series) return;
    for (const pl of chartLinesRef.current) series.removePriceLine(pl);
    chartLinesRef.current = [];
    if (!priceLines) return;
    for (const spec of priceLines) {
      if (!spec.price || !isFinite(spec.price)) continue;
      chartLinesRef.current.push(series.createPriceLine({
        price: spec.price,
        color: "transparent",      // hidden — overlay handles the visual
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: spec.label,
      }));
    }
  }, [priceLines]);

  // ── Data + WebSocket ───────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true, ws: WebSocket | null = null;
    setLivePrice(null);
    livePriceRef.current = null;
    (async () => {
      try {
        const data = await getKlines({ data: { symbol, interval: iv, limit: 1000 } });
        if (!alive) return;
        const candles: CandlestickData[] = data.map((d) => ({
          time: d.time as UTCTimestamp,
          open: d.open, high: d.high, low: d.low, close: d.close,
        }));
        candlesRef.current = candles;
        const pf = precisionFor(candles[candles.length - 1]?.close ?? 0);
        candleRef.current?.applyOptions({ priceFormat: { type: "price", ...pf } });
        candleRef.current?.setData(candles);
        recomputeEMAs();
        chartRef.current?.timeScale().fitContent();
        const lastClose = candles[candles.length - 1]?.close;
        if (lastClose) { setLivePrice(lastClose); livePriceRef.current = lastClose; }

        ws = new WebSocket(`wss://data-stream.binance.vision/ws/${symbol.toLowerCase()}@kline_${iv}`);
        ws.onmessage = (e) => {
          try {
            const k = JSON.parse(e.data).k; if (!k) return;
            const c: CandlestickData = {
              time: Math.floor(k.t / 1000) as UTCTimestamp,
              open: parseFloat(k.o), high: parseFloat(k.h),
              low:  parseFloat(k.l), close: parseFloat(k.c),
            };
            const arr = candlesRef.current;
            if (arr.length && arr[arr.length - 1].time === c.time) arr[arr.length - 1] = c;
            else { arr.push(c); if (arr.length > 1200) arr.shift(); }
            candleRef.current?.update(c);
            recomputeEMAs();
            const newPrice = c.close;
            setLivePrice((prev) => {
              if (prev !== null && newPrice !== prev) setFlash(newPrice > prev ? "up" : "down");
              livePriceRef.current = newPrice;
              return newPrice;
            });
          } catch {}
        };
      } catch (err) { console.error("chart error", err); }
    })();
    return () => { alive = false; ws?.close(); };
  }, [symbol, iv]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [flash]);

  // ── Overlay RAF — positions HTML lines at chart price coords ──────────────
  useEffect(() => {
    let rafId: number;

    function positionLine(
      el: HTMLDivElement | null,
      price: number | null,
      visible: boolean,
    ) {
      if (!el) return;
      if (!visible || price === null || !candleRef.current) {
        el.style.display = "none";
        return;
      }
      const y = candleRef.current.priceToCoordinate(price);
      if (y === null || y < 0) { el.style.display = "none"; return; }
      el.style.display = "block";
      el.style.top = `${Math.round(y)}px`;
    }

    function tick() {
      positionLine(liveLineRef.current,  livePriceRef.current, true);

      const pl = priceLines ?? [];
      const entry = pl.find((l) => l.label.toLowerCase().includes("entry"));
      const tp    = pl.find((l) => l.label.toLowerCase().includes("tp"));
      const sl    = pl.find((l) => l.label.toLowerCase().includes("sl"));
      positionLine(entryLineRef.current, entry?.price ?? null, !!entry);
      positionLine(tpLineRef.current,    tp?.price    ?? null, !!tp);
      positionLine(slLineRef.current,    sl?.price    ?? null, !!sl);

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [priceLines]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    let q = search.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!q) return;
    if (!/USDT$|BUSD$|FDUSD$|BTC$|ETH$/.test(q)) q += "USDT";
    onSymbolChange?.(q); setSearch("");
  }

  const hasLines = priceLines?.some((l) => l.price > 0 && isFinite(l.price));

  return (
    <div className="rounded-2xl border border-primary/20 bg-transparent overflow-hidden">
      <style>{`
        /* ── Header price flash ── */
        @keyframes hdr-up   { 0% { color:#00d4a0; text-shadow:0 0 14px rgba(0,212,160,.8); } 100% { color:inherit; text-shadow:none; } }
        @keyframes hdr-down { 0% { color:#ff2d5f; text-shadow:0 0 14px rgba(255,45,95,.8); }  100% { color:inherit; text-shadow:none; } }
        .hdr-flash-up   { animation: hdr-up   .6s ease-out both; }
        .hdr-flash-down { animation: hdr-down .6s ease-out both; }

        /* ── Priceline label pulses ── */
        @keyframes chart-line-pulse { 0%,100% { opacity:1; } 50% { opacity:.45; } }
        .chart-line-entry { animation: chart-line-pulse 2s ease-in-out infinite; }
        .chart-line-tp    { animation: chart-line-pulse 2s ease-in-out .4s infinite; }
        .chart-line-sl    { animation: chart-line-pulse 2s ease-in-out .8s infinite; }

        /* ── Live price overlay line ── */
        @keyframes live-line-glow {
          0%,100% {
            box-shadow: 0 0 6px 1px rgba(94,234,212,.25), 0 0 0 0 rgba(94,234,212,0);
            opacity: .85;
          }
          50% {
            box-shadow: 0 0 18px 4px rgba(94,234,212,.55), 0 0 40px 8px rgba(94,234,212,.18);
            opacity: 1;
          }
        }
        @keyframes live-dot-beat {
          0%,100% { transform:scale(1);   box-shadow:0 0 0 0 rgba(94,234,212,.7); }
          50%      { transform:scale(1.5); box-shadow:0 0 0 5px rgba(94,234,212,0); }
        }
        @keyframes scan-sweep {
          0%   { transform:translateX(-100%); }
          100% { transform:translateX(350%); }
        }

        .overlay-live-line {
          position: absolute;
          left: 0; right: 68px;
          height: 1.5px;
          transform: translateY(-50%);
          background: linear-gradient(90deg,
            transparent 0%,
            rgba(94,234,212,.15) 5%,
            rgba(94,234,212,.85) 40%,
            rgba(94,234,212,.85) 60%,
            rgba(94,234,212,.15) 95%,
            transparent 100%
          );
          animation: live-line-glow 1.6s ease-in-out infinite;
          pointer-events: none;
        }
        .overlay-live-line::before {
          content:"";
          position:absolute; top:0; left:0; right:0; bottom:0;
          background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.55) 50%,transparent 100%);
          background-size:40% 100%;
          animation: scan-sweep 2.4s ease-in-out infinite;
        }
        .overlay-live-dot {
          position:absolute; left:6px;
          width:8px; height:8px; border-radius:50%;
          background: #5eead4;
          transform:translateY(-50%);
          animation: live-dot-beat 1.6s ease-in-out infinite;
          z-index:2;
        }
        .overlay-live-badge {
          position:absolute; left:20px;
          transform:translateY(-50%);
          background: linear-gradient(90deg,rgba(94,234,212,.18),rgba(94,234,212,.06));
          border:1px solid rgba(94,234,212,.45);
          border-radius:5px;
          padding:1px 7px;
          font-size:10px; font-weight:900;
          color:#5eead4;
          letter-spacing:.04em;
          white-space:nowrap;
          z-index:2;
          text-shadow:0 0 8px rgba(94,234,212,.6);
        }

        /* ── Entry line ── */
        @keyframes entry-glow {
          0%,100% { box-shadow:0 0 4px 0 rgba(163,177,194,.2); opacity:.6; }
          50%      { box-shadow:0 0 12px 2px rgba(163,177,194,.4); opacity:1; }
        }
        .overlay-entry-line {
          position:absolute; left:0; right:68px; height:1px;
          transform:translateY(-50%);
          background:repeating-linear-gradient(90deg, rgba(163,177,194,.8) 0 6px, transparent 6px 12px);
          animation: entry-glow 2s ease-in-out infinite;
          pointer-events:none;
        }
        .overlay-entry-badge {
          position:absolute; left:8px;
          transform:translateY(-50%);
          background:rgba(163,177,194,.12);
          border:1px solid rgba(163,177,194,.35);
          border-radius:4px; padding:1px 6px;
          font-size:9px; font-weight:900; color:rgba(163,177,194,.9);
          letter-spacing:.05em; white-space:nowrap; z-index:2;
        }

        /* ── TP line ── */
        @keyframes tp-glow {
          0%,100% { box-shadow:0 0 6px 0 rgba(0,208,160,.2); opacity:.7; }
          50%      { box-shadow:0 0 18px 4px rgba(0,208,160,.5); opacity:1; }
        }
        .overlay-tp-line {
          position:absolute; left:0; right:68px; height:1.5px;
          transform:translateY(-50%);
          background:repeating-linear-gradient(90deg, rgba(0,208,160,.9) 0 8px, transparent 8px 14px);
          animation: tp-glow 1.8s ease-in-out infinite;
          pointer-events:none;
        }
        .overlay-tp-badge {
          position:absolute; left:8px;
          transform:translateY(-50%);
          background:linear-gradient(90deg,rgba(0,208,160,.2),rgba(0,208,160,.06));
          border:1px solid rgba(0,208,160,.5);
          border-radius:4px; padding:1px 6px;
          font-size:9px; font-weight:900; color:#00d4a0;
          letter-spacing:.05em; white-space:nowrap; z-index:2;
          text-shadow:0 0 6px rgba(0,208,160,.5);
        }
        @keyframes tp-badge-pulse {
          0%,100% { box-shadow:0 0 0 0 rgba(0,208,160,.4); }
          50%      { box-shadow:0 0 0 4px rgba(0,208,160,0); }
        }
        .overlay-tp-badge { animation: tp-badge-pulse 1.8s ease-in-out infinite; }

        /* ── SL line ── */
        @keyframes sl-glow {
          0%,100% { box-shadow:0 0 6px 0 rgba(255,45,95,.2); opacity:.7; }
          50%      { box-shadow:0 0 18px 4px rgba(255,45,95,.5); opacity:1; }
        }
        .overlay-sl-line {
          position:absolute; left:0; right:68px; height:1.5px;
          transform:translateY(-50%);
          background:repeating-linear-gradient(90deg, rgba(255,45,95,.9) 0 8px, transparent 8px 14px);
          animation: sl-glow 1.8s ease-in-out .3s infinite;
          pointer-events:none;
        }
        .overlay-sl-badge {
          position:absolute; left:8px;
          transform:translateY(-50%);
          background:linear-gradient(90deg,rgba(255,45,95,.2),rgba(255,45,95,.06));
          border:1px solid rgba(255,45,95,.5);
          border-radius:4px; padding:1px 6px;
          font-size:9px; font-weight:900; color:#ff2d5f;
          letter-spacing:.05em; white-space:nowrap; z-index:2;
          text-shadow:0 0 6px rgba(255,45,95,.5);
        }
        @keyframes sl-badge-pulse {
          0%,100% { box-shadow:0 0 0 0 rgba(255,45,95,.4); }
          50%      { box-shadow:0 0 0 4px rgba(255,45,95,0); }
        }
        .overlay-sl-badge { animation: sl-badge-pulse 1.8s ease-in-out .3s infinite; }
      `}</style>

      {/* ── HEADER ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <CoinIcon symbol={base} size={28} />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-black text-sm md:text-base truncate leading-none">{symbol}</span>
            {livePrice && (
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                <span
                  key={String(livePrice)}
                  className={`text-xs font-black tabular-nums leading-none ${
                    flash === "up" ? "hdr-flash-up text-emerald-400"
                    : flash === "down" ? "hdr-flash-down text-red-400"
                    : "text-muted-foreground"
                  }`}
                >
                  {flash === "up" ? "▲" : flash === "down" ? "▼" : ""} ${fmtPrice(livePrice)}
                </span>
              </div>
            )}
          </div>
          <div className="hidden md:flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-[3px] bg-white/70" />EMA 200</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-[2px] bg-blue-500" />EMA 21</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-[2px] bg-yellow-400" />EMA 9</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {searchable && (
            <form onSubmit={submitSearch} className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. ETH, SOLUSDT"
                className="bg-transparent text-xs outline-none w-32 sm:w-40 placeholder:text-muted-foreground/60" />
              <button type="submit" className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/20 text-primary hover:bg-primary/30">GO</button>
            </form>
          )}
          {showIntervalControls && (
            <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
              {INTERVALS.map((i) => (
                <button key={i} onClick={() => { setIv(i); onIntervalChange?.(i); }}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${iv === i ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                  {i}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── TP / SL / Entry label strip ── */}
      {hasLines && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-muted/10 flex-wrap">
          {priceLines!.map((spec, i) => {
            if (!spec.price || !isFinite(spec.price)) return null;
            const isEntry = spec.label.toLowerCase().includes("entry");
            const isTp    = spec.label.toLowerCase().includes("tp");
            const isSl    = spec.label.toLowerCase().includes("sl");
            return (
              <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold ${
                isEntry ? "chart-line-entry border-border/80 bg-muted/30 text-muted-foreground"
                : isTp  ? "chart-line-tp  border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : isSl  ? "chart-line-sl  border-red-500/30    bg-red-500/10    text-red-400"
                :          "border-border/60 bg-muted/20 text-muted-foreground"
              }`}>
                <span className="inline-block w-3 h-[2px] rounded" style={{ background: spec.color }} />
                {spec.label}
              </div>
            );
          })}
        </div>
      )}

      {/* ── CHART + OVERLAY ── */}
      <div className="relative" style={{ height }}>
        {/* lightweight-charts canvas */}
        <div ref={chartWrapRef} className="absolute inset-0" />

        {/* HTML overlay — price line effects */}
        <div ref={overlayRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>

          {/* Live price line */}
          <div ref={liveLineRef} style={{ display: "none", position: "absolute", left: 0, right: 0 }}>
            <div className="overlay-live-dot" />
            <div className="overlay-live-line" />
            <div className="overlay-live-badge">
              ◆ LIVE &nbsp;${livePrice ? fmtPrice(livePrice) : "…"}
            </div>
          </div>

          {/* Entry line */}
          <div ref={entryLineRef} style={{ display: "none", position: "absolute", left: 0, right: 0 }}>
            <div className="overlay-entry-line" />
            <div className="overlay-entry-badge">
              ── ENTRY
            </div>
          </div>

          {/* TP line */}
          <div ref={tpLineRef} style={{ display: "none", position: "absolute", left: 0, right: 0 }}>
            <div className="overlay-tp-line" />
            <div className="overlay-tp-badge">
              ▲ TAKE PROFIT
            </div>
          </div>

          {/* SL line */}
          <div ref={slLineRef} style={{ display: "none", position: "absolute", left: 0, right: 0 }}>
            <div className="overlay-sl-line" />
            <div className="overlay-sl-badge">
              ▼ STOP LOSS
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
