import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type UTCTimestamp,
  type IPriceLine,
  CrosshairMode,
  LineStyle,
} from "lightweight-charts";
import { Search } from "lucide-react";
import { getKlines } from "@/lib/binance.functions";
import { CoinIcon } from "./CoinIcon";

type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

function ema(values: number[], period: number): (number | undefined)[] {
  const k = 2 / (period + 1);
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  let prev: number | undefined;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      sum += values[i];
      if (i === period - 1) {
        prev = sum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = values[i] * k + (prev as number) * (1 - k);
    out[i] = prev;
  }
  return out;
}

function precisionFor(price: number): { precision: number; minMove: number } {
  if (!price || price >= 1000) return { precision: 2, minMove: 0.01 };
  if (price >= 100) return { precision: 3, minMove: 0.001 };
  if (price >= 1) return { precision: 4, minMove: 0.0001 };
  if (price >= 0.01) return { precision: 5, minMove: 0.00001 };
  if (price >= 0.0001) return { precision: 6, minMove: 0.000001 };
  return { precision: 8, minMove: 0.00000001 };
}

interface PriceLineSpec {
  price: number;
  label: string;
  color: string;
}

interface Props {
  symbol: string;
  interval?: Interval;
  height?: number;
  onIntervalChange?: (i: Interval) => void;
  onSymbolChange?: (s: string) => void;
  showIntervalControls?: boolean;
  searchable?: boolean;
  priceLines?: PriceLineSpec[];
}

export function PriceChart({
  symbol,
  interval = "1m",
  height = 460,
  onIntervalChange,
  onSymbolChange,
  showIntervalControls = true,
  searchable = false,
  priceLines,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema9Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const candlesRef = useRef<CandlestickData[]>([]);
  const linesRef = useRef<IPriceLine[]>([]);
  const [iv, setIv] = useState<Interval>(interval);
  const [search, setSearch] = useState("");
  const base = symbol.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, "");

  useEffect(() => setIv(interval), [interval]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const chart = createChart(wrapRef.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#a3b1c2", fontFamily: "ui-sans-serif, system-ui" },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.035)" },
        horzLines: { color: "rgba(255,255,255,0.035)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.06)", scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: "rgba(255,255,255,0.06)", timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 7 },
      crosshair: { mode: CrosshairMode.Normal },
    });
    chartRef.current = chart;
    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#34d399",
      borderDownColor: "#f87171",
      wickUpColor: "#34d399",
      wickDownColor: "#f87171",
    });
    ema200Ref.current = chart.addSeries(LineSeries, { color: "#ffffff", lineWidth: 4, priceLineVisible: false, lastValueVisible: false });
    ema21Ref.current = chart.addSeries(LineSeries, { color: "#3b82f6", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    ema9Ref.current = chart.addSeries(LineSeries, { color: "#facc15", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  function recomputeEMAs() {
    const closes = candlesRef.current.map((c) => c.close);
    const times = candlesRef.current.map((c) => c.time as UTCTimestamp);
    const series: Array<[ISeriesApi<"Line"> | null, number]> = [
      [ema200Ref.current, 200], [ema21Ref.current, 21], [ema9Ref.current, 9],
    ];
    for (const [s, period] of series) {
      if (!s) continue;
      const vals = ema(closes, period);
      const line: LineData[] = [];
      for (let i = 0; i < vals.length; i++) {
        if (vals[i] !== undefined) line.push({ time: times[i], value: vals[i] as number });
      }
      s.setData(line);
    }
  }

  // Apply price lines (entry / TP / SL)
  useEffect(() => {
    const series = candleRef.current;
    if (!series) return;
    for (const pl of linesRef.current) series.removePriceLine(pl);
    linesRef.current = [];
    if (!priceLines) return;
    for (const spec of priceLines) {
      if (!spec.price || !isFinite(spec.price)) continue;
      const line = series.createPriceLine({
        price: spec.price,
        color: spec.color,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: spec.label,
      });
      linesRef.current.push(line);
    }
  }, [priceLines]);

  useEffect(() => {
    let alive = true;
    let ws: WebSocket | null = null;
    (async () => {
      try {
        // 1000 candles so EMA 200 spans the whole visible chart
        const data = await getKlines({ data: { symbol, interval: iv, limit: 1000 } });
        if (!alive) return;
        const candles: CandlestickData[] = data.map((d) => ({
          time: d.time as UTCTimestamp,
          open: d.open, high: d.high, low: d.low, close: d.close,
        }));
        candlesRef.current = candles;
        const last = candles[candles.length - 1]?.close ?? 0;
        const pf = precisionFor(last);
        candleRef.current?.applyOptions({ priceFormat: { type: "price", precision: pf.precision, minMove: pf.minMove } });
        candleRef.current?.setData(candles);
        recomputeEMAs();
        chartRef.current?.timeScale().fitContent();

        ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${iv}`);
        ws.onmessage = (e) => {
          try {
            const m = JSON.parse(e.data);
            const k = m.k;
            if (!k) return;
            const c: CandlestickData = {
              time: Math.floor(k.t / 1000) as UTCTimestamp,
              open: parseFloat(k.o), high: parseFloat(k.h), low: parseFloat(k.l), close: parseFloat(k.c),
            };
            const arr = candlesRef.current;
            if (arr.length && arr[arr.length - 1].time === c.time) arr[arr.length - 1] = c;
            else { arr.push(c); if (arr.length > 1200) arr.shift(); }
            candleRef.current?.update(c);
            recomputeEMAs();
          } catch {}
        };
      } catch (err) {
        console.error("chart load error", err);
      }
    })();
    return () => { alive = false; if (ws) ws.close(); };
  }, [symbol, iv]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    let q = search.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!q) return;
    if (!/USDT$|BUSD$|FDUSD$|BTC$|ETH$/.test(q)) q = q + "USDT";
    onSymbolChange?.(q);
    setSearch("");
  }

  return (
    <div className="rounded-2xl border border-primary/20 bg-card overflow-hidden shadow-[0_0_40px_-15px_rgba(94,234,212,0.25)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <CoinIcon symbol={base} size={28} />
          <span className="font-black text-sm md:text-base truncate">{symbol}</span>
          <div className="hidden md:flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-[3px] bg-white"></span>EMA 200</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-[2px] bg-blue-500"></span>EMA 21</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-5 h-[2px] bg-yellow-400"></span>EMA 9</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {searchable && (
            <form onSubmit={submitSearch} className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search e.g. ETH, SOLUSDT"
                className="bg-transparent text-xs outline-none w-32 sm:w-40 placeholder:text-muted-foreground/60"
              />
              <button type="submit" className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/20 text-primary hover:bg-primary/30">
                GO
              </button>
            </form>
          )}
          {showIntervalControls && (
            <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
              {INTERVALS.map((i) => (
                <button
                  key={i}
                  onClick={() => { setIv(i); onIntervalChange?.(i); }}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    iv === i ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div ref={wrapRef} style={{ height }} />
    </div>
  );
}
