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
  if (price >= 100) return { precision: 3, minMove: 0.001 };
  if (price >= 1) return { precision: 4, minMove: 0.0001 };
  if (price >= 0.01) return { precision: 5, minMove: 0.00001 };
  if (price >= 0.0001) return { precision: 6, minMove: 0.000001 };
  return { precision: 8, minMove: 0.00000001 };
}

function fmtPrice(p: number) {
  if (!p || !isFinite(p)) return "…";
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toFixed(6);
}

interface PriceLineSpec { price: number; label: string; color: string; }
interface Props {
  symbol: string; interval?: Interval; height?: number;
  onIntervalChange?: (i: Interval) => void; onSymbolChange?: (s: string) => void;
  showIntervalControls?: boolean; searchable?: boolean; priceLines?: PriceLineSpec[];
}

export function PriceChart({ symbol, interval = "1m", height = 460, onIntervalChange, onSymbolChange, showIntervalControls = true, searchable = false, priceLines }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema9Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const candlesRef = useRef<CandlestickData[]>([]);
  const linesRef = useRef<IPriceLine[]>([]);
  const prevPriceRef = useRef<number | null>(null);
  const [iv, setIv] = useState<Interval>(interval);
  const [search, setSearch] = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const base = symbol.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, "");

  useEffect(() => setIv(interval), [interval]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const chart = createChart(wrapRef.current, {
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
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 12,
        minBarSpacing: 4,
      },
      crosshair: { mode: CrosshairMode.Normal },
    });
    chartRef.current = chart;
    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor:         "rgba(0, 208, 160, 0.55)",
      borderUpColor:   "#00d4a0",
      wickUpColor:     "#00d4a0",
      downColor:       "rgba(255, 45, 95, 0.55)",
      borderDownColor: "#ff2d5f",
      wickDownColor:   "#ff2d5f",
      lastPriceAnimation: LastPriceAnimationMode.Continuous,
    });
    ema200Ref.current = chart.addSeries(LineSeries, { color: "rgba(255,255,255,0.7)", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    ema21Ref.current = chart.addSeries(LineSeries, { color: "#3b82f6", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    ema9Ref.current = chart.addSeries(LineSeries, { color: "#facc15", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  function recomputeEMAs() {
    const closes = candlesRef.current.map((c) => c.close);
    const times = candlesRef.current.map((c) => c.time as UTCTimestamp);
    for (const [s, period] of [[ema200Ref.current, 200], [ema21Ref.current, 21], [ema9Ref.current, 9]] as [ISeriesApi<"Line"> | null, number][]) {
      if (!s) continue;
      const vals = ema(closes, period);
      const line: LineData[] = [];
      for (let i = 0; i < vals.length; i++) if (vals[i] !== undefined) line.push({ time: times[i], value: vals[i] as number });
      s.setData(line);
    }
  }

  useEffect(() => {
    const series = candleRef.current; if (!series) return;
    for (const pl of linesRef.current) series.removePriceLine(pl); linesRef.current = [];
    if (!priceLines) return;
    for (const spec of priceLines) {
      if (!spec.price || !isFinite(spec.price)) continue;
      linesRef.current.push(series.createPriceLine({
        price: spec.price,
        color: spec.color,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: spec.label,
      }));
    }
  }, [priceLines]);

  useEffect(() => {
    let alive = true, ws: WebSocket | null = null;
    setLivePrice(null);
    prevPriceRef.current = null;
    (async () => {
      try {
        const data = await getKlines({ data: { symbol, interval: iv, limit: 1000 } });
        if (!alive) return;
        const candles: CandlestickData[] = data.map((d) => ({ time: d.time as UTCTimestamp, open: d.open, high: d.high, low: d.low, close: d.close }));
        candlesRef.current = candles;
        const pf = precisionFor(candles[candles.length - 1]?.close ?? 0);
        candleRef.current?.applyOptions({ priceFormat: { type: "price", ...pf } });
        candleRef.current?.setData(candles); recomputeEMAs();
        chartRef.current?.timeScale().fitContent();
        const lastClose = candles[candles.length - 1]?.close;
        if (lastClose) { setLivePrice(lastClose); prevPriceRef.current = lastClose; }
        ws = new WebSocket(`wss://data-stream.binance.vision/ws/${symbol.toLowerCase()}@kline_${iv}`);
        ws.onmessage = (e) => {
          try {
            const k = JSON.parse(e.data).k; if (!k) return;
            const c: CandlestickData = { time: Math.floor(k.t / 1000) as UTCTimestamp, open: parseFloat(k.o), high: parseFloat(k.h), low: parseFloat(k.l), close: parseFloat(k.c) };
            const arr = candlesRef.current;
            if (arr.length && arr[arr.length - 1].time === c.time) arr[arr.length - 1] = c;
            else { arr.push(c); if (arr.length > 1200) arr.shift(); }
            candleRef.current?.update(c); recomputeEMAs();
            const newPrice = c.close;
            setLivePrice((prev) => {
              if (prev !== null && newPrice !== prev) setFlash(newPrice > prev ? "up" : "down");
              return newPrice;
            });
          } catch {}
        };
      } catch (err) { console.error("chart error", err); }
    })();
    return () => { alive = false; if (ws) ws.close(); };
  }, [symbol, iv]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(t);
  }, [flash]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    let q = search.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!q) return;
    if (!/USDT$|BUSD$|FDUSD$|BTC$|ETH$/.test(q)) q += "USDT";
    onSymbolChange?.(q); setSearch("");
  }

  const hasLines = priceLines && priceLines.some((l) => l.price > 0 && isFinite(l.price));

  return (
    <div className="rounded-2xl border border-primary/20 bg-card overflow-hidden shadow-[0_0_40px_-15px_rgba(94,234,212,0.25)]">
      <style>{`
        /* ── Flash animations (on price change) ── */
        @keyframes chart-price-up {
          0%   { background: rgba(0,212,160,0.22); color: #00d4a0; text-shadow: 0 0 16px rgba(0,212,160,0.8); }
          100% { background: transparent; text-shadow: none; }
        }
        @keyframes chart-price-down {
          0%   { background: rgba(255,45,95,0.22); color: #ff2d5f; text-shadow: 0 0 16px rgba(255,45,95,0.8); }
          100% { background: transparent; text-shadow: none; }
        }
        @keyframes chart-line-pulse {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.45; }
        }
        @keyframes chart-border-glow {
          0%,100% { box-shadow: 0 0 40px -15px rgba(94,234,212,0.25); }
          50%     { box-shadow: 0 0 55px -10px rgba(94,234,212,0.40); }
        }
        /* ── Persistent live price glow ── */
        @keyframes live-price-glow {
          0%, 100% {
            box-shadow: 0 0 0 0 color-mix(in oklab, var(--primary) 0%, transparent);
          }
          50% {
            box-shadow: 0 0 16px 3px color-mix(in oklab, var(--primary) 20%, transparent);
          }
        }
        /* ── Blinking live dot ── */
        @keyframes live-dot-beat {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.6); opacity: 0.5; }
        }
        /* ── Scanning line sweep across price display ── */
        @keyframes scan-sweep {
          0%   { transform: translateX(-120%); opacity: 0; }
          20%  { opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateX(120%); opacity: 0; }
        }

        .chart-price-flash-up   { animation: chart-price-up   0.6s ease-out both; }
        .chart-price-flash-down { animation: chart-price-down 0.6s ease-out both; }
        .chart-line-entry { animation: chart-line-pulse 2s ease-in-out infinite; }
        .chart-line-tp    { animation: chart-line-pulse 2s ease-in-out 0.4s infinite; }
        .chart-line-sl    { animation: chart-line-pulse 2s ease-in-out 0.8s infinite; }
        .chart-glow       { animation: chart-border-glow 3s ease-in-out infinite; }
        .live-price-wrap  { animation: live-price-glow 2s ease-in-out infinite; }
        .live-dot         { animation: live-dot-beat 1.4s ease-in-out infinite; }
        .scan-line {
          position: absolute;
          top: 0; bottom: 0;
          width: 40%;
          background: linear-gradient(90deg, transparent, color-mix(in oklab, var(--primary) 18%, transparent), transparent);
          animation: scan-sweep 3s ease-in-out infinite;
          pointer-events: none;
        }
      `}</style>

      {/* ── HEADER ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <CoinIcon symbol={base} size={28} />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-black text-sm md:text-base truncate leading-none">{symbol}</span>

            {/* ── ENHANCED LIVE PRICE ── */}
            {livePrice && (
              <div className={`live-price-wrap relative inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 -mx-2 overflow-hidden transition-colors duration-300 ${
                flash === "up"   ? "bg-emerald-500/15 border border-emerald-500/30" :
                flash === "down" ? "bg-red-500/15 border border-red-500/30" :
                "bg-primary/8 border border-primary/15"
              }`}>
                {/* Scanning shimmer — only when idle */}
                {!flash && <span className="scan-line" />}
                {/* Blinking live dot */}
                <span className={`live-dot relative h-1.5 w-1.5 rounded-full shrink-0 ${
                  flash === "up" ? "bg-emerald-400" : flash === "down" ? "bg-red-400" : "bg-primary"
                }`} />
                <span
                  key={String(livePrice)}
                  className={`relative text-xs font-black tabular-nums leading-none transition-colors rounded px-0.5 ${
                    flash === "up"
                      ? "chart-price-flash-up text-emerald-400"
                      : flash === "down"
                      ? "chart-price-flash-down text-red-400"
                      : "text-primary"
                  }`}
                >
                  {flash === "up" ? "▲" : flash === "down" ? "▼" : ""} ${fmtPrice(livePrice)}
                </span>
              </div>
            )}
          </div>

          <div className="hidden md:flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-[3px] bg-white/70"></span>EMA 200</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-[2px] bg-blue-500"></span>EMA 21</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-[2px] bg-yellow-400"></span>EMA 9</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {searchable && (
            <form onSubmit={submitSearch} className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. ETH, SOLUSDT" className="bg-transparent text-xs outline-none w-32 sm:w-40 placeholder:text-muted-foreground/60" />
              <button type="submit" className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/20 text-primary hover:bg-primary/30">GO</button>
            </form>
          )}
          {showIntervalControls && (
            <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
              {INTERVALS.map((i) => (
                <button key={i} onClick={() => { setIv(i); onIntervalChange?.(i); }} className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${iv === i ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{i}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── ENTRY / TP / SL ANIMATED STRIP ── */}
      {hasLines && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-muted/10 flex-wrap">
          {priceLines!.map((spec, i) => {
            if (!spec.price || !isFinite(spec.price)) return null;
            const isEntry = spec.label.toLowerCase().includes("entry");
            const isTp = spec.label.toLowerCase().includes("tp");
            const isSl = spec.label.toLowerCase().includes("sl");
            return (
              <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold ${
                isEntry ? "chart-line-entry border-border/80 bg-muted/30 text-muted-foreground"
                : isTp   ? "chart-line-tp border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : isSl   ? "chart-line-sl border-red-500/30 bg-red-500/10 text-red-400"
                :           "border-border/60 bg-muted/20 text-muted-foreground"
              }`}>
                <span className="inline-block w-3 h-[2px] rounded" style={{ background: spec.color }} />
                {spec.label}
              </div>
            );
          })}
        </div>
      )}

      {/* ── CHART ── */}
      <div ref={wrapRef} style={{ height }} />
    </div>
  );
}
