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

// ─── Zig Zag Channels [LuxAlgo] — ported from Pine Script v4 ────────────────
// Original: © LuxAlgo  CC BY-NC-SA 4.0
// Logic: detects swing pivots via a state machine (os), draws zig-zag line
// between them, and computes upper/lower channel bands from max price deviation.
interface ZZPivot { time: UTCTimestamp; price: number; type: "top" | "btm"; }
interface ZZChannels {
  center: LineData[]; upper: LineData[]; lower: LineData[];
  // Upper/lower slice covering ONLY the most recent (still-forming) trend
  // segment — used to render the glow halo on the current channel only.
  currentUpper: LineData[]; currentLower: LineData[];
  // Confirmed swing pivots, for swing-high/low price labels.
  pivots: ZZPivot[];
}

function computeZigZagChannels(
  candles: CandlestickData[],
  length = 100,
): ZZChannels {
  const n = candles.length;
  if (n < length + 2) return { center: [], upper: [], lower: [], currentUpper: [], currentLower: [], pivots: [] };

  const closes = candles.map((c) => c.close);
  const highs  = candles.map((c) => c.high);
  const lows   = candles.map((c) => c.low);
  const opens  = candles.map((c) => c.open);
  const times  = candles.map((c) => c.time as UTCTimestamp);

  // Rolling highest/lowest of close over `length` bars
  // Pine: upper = highest(close, length), lower = lowest(close, length)
  const rollingMax: number[] = new Array(n).fill(-Infinity);
  const rollingMin: number[] = new Array(n).fill(Infinity);
  for (let i = length - 1; i < n; i++) {
    let mx = -Infinity, mn = Infinity;
    for (let j = i - length + 1; j <= i; j++) {
      if (mx < closes[j]) mx = closes[j];
      if (mn > closes[j]) mn = closes[j];
    }
    rollingMax[i] = mx;
    rollingMin[i] = mn;
  }

  // os state machine
  // os=0 → downtrend (looking for bottom), os=1 → uptrend (looking for top)
  // Pine: os := src[length] > upper ? 0 : src[length] < lower ? 1 : os[1]
  const os: number[] = new Array(n).fill(0);
  for (let i = length; i < n; i++) {
    const srcBack = closes[i - length]; // Pine: close[length]
    if      (srcBack > rollingMax[i]) os[i] = 0;
    else if (srcBack < rollingMin[i]) os[i] = 1;
    else                               os[i] = os[i - 1];
  }

  // Detect pivot bars
  // btm = os==1 && os[1]!=1  → pivot bottom at (i-length), price = low[length]
  // top = os==0 && os[1]!=0  → pivot top    at (i-length), price = high[length]
  type Pivot = { bar: number; price: number; type: "top" | "btm" };
  const pivots: Pivot[] = [];

  for (let i = 1; i < n; i++) {
    const pivotBar = i - length;
    if (pivotBar < 0) continue;
    const btm = os[i] === 1 && os[i - 1] !== 1;
    const top = os[i] === 0 && os[i - 1] !== 0;
    if (btm) pivots.push({ bar: pivotBar, price: lows[pivotBar],  type: "btm" });
    if (top) pivots.push({ bar: pivotBar, price: highs[pivotBar], type: "top" });
  }

  pivots.sort((a, b) => a.bar - b.bar);
  if (pivots.length === 0) return { center: [], upper: [], lower: [], currentUpper: [], currentLower: [], pivots: [] };

  const centerArr: number[] = new Array(n).fill(NaN);
  const upperArr:  number[] = new Array(n).fill(NaN);
  const lowerArr:  number[] = new Array(n).fill(NaN);

  // For each segment A→B: interpolate center, measure max candle body deviation
  // to build upper/lower channel (Pine: max_diff_up / max_diff_dn loop)
  function fillSegment(
    fromBar: number, fromPrice: number,
    toBar:   number, toPrice:   number,
  ) {
    const segLen = toBar - fromBar;
    if (segLen <= 0) return;

    let maxUp = 0, maxDn = 0;
    for (let k = 0; k <= segLen; k++) {
      const b  = fromBar + k;
      if (b >= n) break;
      const t  = k / segLen;
      const pt = fromPrice + t * (toPrice - fromPrice);
      const hi = Math.max(closes[b], opens[b]);
      const lo = Math.min(closes[b], opens[b]);
      if (hi - pt > maxUp) maxUp = hi - pt;
      if (pt - lo > maxDn) maxDn = pt - lo;
    }
    for (let k = 0; k <= segLen; k++) {
      const b  = fromBar + k;
      if (b >= n) break;
      const t  = k / segLen;
      const pt = fromPrice + t * (toPrice - fromPrice);
      centerArr[b] = pt;
      upperArr[b]  = pt + maxUp;
      lowerArr[b]  = pt - maxDn;
    }
  }

  for (let i = 0; i < pivots.length - 1; i++) {
    fillSegment(pivots[i].bar, pivots[i].price, pivots[i + 1].bar, pivots[i + 1].price);
  }

  // Extend last incomplete segment to current bar (Pine: barstate.islast + extend=true)
  const last = pivots[pivots.length - 1];
  fillSegment(last.bar, last.price, n - 1, closes[n - 1]);

  const center: LineData[] = [], upper: LineData[] = [], lower: LineData[] = [];
  for (let i = 0; i < n; i++) {
    if (!isNaN(centerArr[i])) {
      center.push({ time: times[i], value: centerArr[i] });
      upper.push({  time: times[i], value: upperArr[i]  });
      lower.push({  time: times[i], value: lowerArr[i]  });
    }
  }

  // Only the segment from the last confirmed pivot onward is still "forming"
  // (the current trend channel) — glow should only ever touch this slice.
  const currentStart = times[last.bar];
  const currentUpper = upper.filter((p) => (p.time as number) >= (currentStart as number));
  const currentLower = lower.filter((p) => (p.time as number) >= (currentStart as number));

  const pivotLabels: ZZPivot[] = pivots.map((p) => ({ time: times[p.bar], price: p.price, type: p.type }));

  return { center, upper, lower, currentUpper, currentLower, pivots: pivotLabels };
}
// ────────────────────────────────────────────────────────────────────────────

interface PriceLineSpec { price: number; label: string; color: string; }
interface Props {
  symbol: string; interval?: Interval; height?: number;
  onIntervalChange?: (i: Interval) => void; onSymbolChange?: (s: string) => void;
  showIntervalControls?: boolean; searchable?: boolean; priceLines?: PriceLineSpec[];
}

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

  // ── Zig Zag series (canvas) ──────────────────────────────────────────────
  const zzCenterRef    = useRef<ISeriesApi<"Line"> | null>(null);
  const zzUpperRef     = useRef<ISeriesApi<"Line"> | null>(null);
  const zzLowerRef     = useRef<ISeriesApi<"Line"> | null>(null);
  // Glow halos rendered behind the crisp upper/lower lines (same data, wider + softer)
  const zzUpperGlowRef = useRef<ISeriesApi<"Line"> | null>(null);
  const zzLowerGlowRef = useRef<ISeriesApi<"Line"> | null>(null);

  const candlesRef    = useRef<CandlestickData[]>([]);
  const chartLinesRef = useRef<IPriceLine[]>([]);

  // ── Swing high/low pivot labels (BTCUSDT ZZ only) ─────────────────────────
  const zzPivotsRef          = useRef<{ time: UTCTimestamp; price: number; type: "top" | "btm" }[]>([]);
  const zzLabelsContainerRef = useRef<HTMLDivElement>(null);
  const zzLabelPoolRef       = useRef<HTMLDivElement[]>([]);

  // ── Overlay DOM refs ──────────────────────────────────────────────────────
  const liveLineRef    = useRef<HTMLDivElement>(null);
  const entryLineRef   = useRef<HTMLDivElement>(null);
  const tpLineRef      = useRef<HTMLDivElement>(null);
  const slLineRef      = useRef<HTMLDivElement>(null);

  // ── Price refs (used inside RAF without stale closure) ────────────────────
  const livePriceRef   = useRef<number | null>(null);
  const symbolRef      = useRef(symbol);

  const [iv, setIv]              = useState<Interval>(interval);
  const [search, setSearch]      = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [flash, setFlash]        = useState<"up" | "down" | null>(null);

  const base = symbol.replace(/USDT$|BUSD$|FDUSD$|BTC$|ETH$/, "");

  useEffect(() => setIv(interval), [interval]);
  useEffect(() => { symbolRef.current = symbol; }, [symbol]);

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

    // ── ZZ center: orange solid ──────────────────────────────────────────────
    zzCenterRef.current = chart.addSeries(LineSeries, {
      color: "#ff5d00",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    // ── ZZ upper glow halo: soft, wide amber line rendered behind the crisp
    // line below — its opacity is pulsed in the RAF loop for a glow effect.
    zzUpperGlowRef.current = chart.addSeries(LineSeries, {
      color: "rgba(245,158,11,0.18)",
      lineWidth: 6,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    // ── ZZ upper: crisp amber resistance line
    zzUpperRef.current = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 2,
      lineStyle: LineStyle.LargeDashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    // ── ZZ lower glow halo: soft, wide cyan line rendered behind the crisp
    // line below — its opacity is pulsed in the RAF loop for a glow effect.
    zzLowerGlowRef.current = chart.addSeries(LineSeries, {
      color: "rgba(6,182,212,0.18)",
      lineWidth: 6,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    // ── ZZ lower: crisp cyan support line
    zzLowerRef.current = chart.addSeries(LineSeries, {
      color: "#06b6d4",
      lineWidth: 2,
      lineStyle: LineStyle.LargeDashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  // ── EMA recompute ─────────────────────────────────────────────────────────
  function recomputeEMAs() {
    // EMAs are hidden for BTCUSDT — the ZZ channel is the only overlay there.
    if (symbol === "BTCUSDT") {
      ema200Ref.current?.setData([]);
      ema21Ref.current?.setData([]);
      ema9Ref.current?.setData([]);
      return;
    }
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

  // ── ZigZag recompute (BTCUSDT only) ──────────────────────────────────────
  function recomputeZigZag() {
    if (!zzCenterRef.current || !zzUpperRef.current || !zzLowerRef.current) return;
    if (symbol !== "BTCUSDT") {
      zzCenterRef.current.setData([]);
      zzUpperRef.current.setData([]);
      zzLowerRef.current.setData([]);
      zzUpperGlowRef.current?.setData([]);
      zzLowerGlowRef.current?.setData([]);
      zzPivotsRef.current = [];
      return;
    }
    const { center, upper, lower, currentUpper, currentLower, pivots } = computeZigZagChannels(candlesRef.current);
    zzCenterRef.current.setData(center);
    zzUpperRef.current.setData(upper);
    zzLowerRef.current.setData(lower);
    // Glow halo only ever carries the current (still-forming) segment's data —
    // previous, already-confirmed trend channels stay plain dashed, no glow.
    zzUpperGlowRef.current?.setData(currentUpper);
    zzLowerGlowRef.current?.setData(currentLower);
    zzPivotsRef.current = pivots;
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
        color: "transparent",
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
        recomputeZigZag();
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
            // ZigZag only on candle close to avoid per-tick overhead
            if (k.x) recomputeZigZag();
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

  // ── Overlay RAF ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let rafId: number;

    function positionLine(el: HTMLDivElement | null, price: number | null, visible: boolean) {
      if (!el) return;
      if (!visible || price === null || !candleRef.current) { el.style.display = "none"; return; }
      const y = candleRef.current.priceToCoordinate(price);
      if (y === null || y < 0) { el.style.display = "none"; return; }
      el.style.display = "block";
      el.style.top = `${Math.round(y)}px`;
    }

    function getSwingLabelEl(i: number): HTMLDivElement | null {
      const container = zzLabelsContainerRef.current;
      if (!container) return null;
      let el = zzLabelPoolRef.current[i];
      if (!el) {
        el = document.createElement("div");
        el.className = "overlay-swing-label";
        const dot = document.createElement("span");
        dot.className = "overlay-swing-dot";
        const txt = document.createElement("span");
        txt.className = "overlay-swing-text";
        el.appendChild(dot);
        el.appendChild(txt);
        container.appendChild(el);
        zzLabelPoolRef.current[i] = el;
      }
      return el;
    }

    function positionSwingLabels() {
      const container = zzLabelsContainerRef.current;
      if (!container) return;
      const pivots = zzPivotsRef.current;
      if (symbolRef.current !== "BTCUSDT" || pivots.length === 0) {
        for (const el of zzLabelPoolRef.current) el.style.display = "none";
        return;
      }
      const chart = chartRef.current, series = candleRef.current;
      const rect = container.getBoundingClientRect();
      if (!chart || !series) return;
      const ts = chart.timeScale();
      for (let i = 0; i < pivots.length; i++) {
        const p  = pivots[i];
        const el = getSwingLabelEl(i);
        if (!el) continue;
        const x = ts.timeToCoordinate(p.time);
        const y = series.priceToCoordinate(p.price);
        if (x === null || y === null || x < 0 || x > rect.width || y < 0 || y > rect.height) {
          el.style.display = "none";
          continue;
        }
        el.style.display = "flex";
        el.style.left = `${Math.round(x)}px`;
        el.style.top  = `${Math.round(y)}px`;
        el.classList.toggle("swing-top", p.type === "top");
        el.classList.toggle("swing-btm", p.type === "btm");
        const txt = el.querySelector(".overlay-swing-text");
        if (txt) txt.textContent = fmtPrice(p.price);
      }
      // Hide any pooled labels left over from a previous, larger pivot set.
      for (let i = pivots.length; i < zzLabelPoolRef.current.length; i++) {
        zzLabelPoolRef.current[i].style.display = "none";
      }
    }

    function tick(now: number) {
      // Live price line
      positionLine(liveLineRef.current, livePriceRef.current, true);

      // Entry / TP / SL
      const pl    = priceLines ?? [];
      const entry = pl.find((l) => l.label.toLowerCase().includes("entry"));
      const tp    = pl.find((l) => l.label.toLowerCase().includes("tp"));
      const sl    = pl.find((l) => l.label.toLowerCase().includes("sl"));
      positionLine(entryLineRef.current, entry?.price ?? null, !!entry);
      positionLine(tpLineRef.current,    tp?.price    ?? null, !!tp);
      positionLine(slLineRef.current,    sl?.price    ?? null, !!sl);

      // Zig-zag upper/lower band glow — pulses the halo behind the real,
      // time-varying channel lines (drawn on-canvas, always perfectly
      // aligned with the actual trend). Only carries data for the current
      // (still-forming) segment, so older confirmed channels never glow.
      if (symbolRef.current === "BTCUSDT") {
        const t = now / 1000;
        const pulse = 0.16 + 0.28 * (0.5 + 0.5 * Math.sin(t * 2.2));
        zzUpperGlowRef.current?.applyOptions({ color: `rgba(245,158,11,${pulse.toFixed(3)})` });
        zzLowerGlowRef.current?.applyOptions({ color: `rgba(6,182,212,${pulse.toFixed(3)})` });
      }

      // Swing high/low price labels — one per confirmed pivot, positioned
      // via the chart's own time/price coordinate mapping so they always
      // sit exactly on the real swing point.
      positionSwingLabels();

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
  const isBtc    = symbol === "BTCUSDT";

  return (
    <div className="rounded-2xl border border-primary/20 bg-transparent overflow-hidden">
      <style>{`
        /* ── Header price flash ────────────────────────────────────────────── */
        @keyframes hdr-up   { 0% { color:#00d4a0; text-shadow:0 0 14px rgba(0,212,160,.8); } 100% { color:inherit; text-shadow:none; } }
        @keyframes hdr-down { 0% { color:#ff2d5f; text-shadow:0 0 14px rgba(255,45,95,.8); }  100% { color:inherit; text-shadow:none; } }
        .hdr-flash-up   { animation: hdr-up   .6s ease-out both; }
        .hdr-flash-down { animation: hdr-down .6s ease-out both; }

        /* ── Priceline label pulses ─────────────────────────────────────────  */
        @keyframes chart-line-pulse { 0%,100% { opacity:1; } 50% { opacity:.45; } }
        .chart-line-entry { animation: chart-line-pulse 2s ease-in-out infinite; }
        .chart-line-tp    { animation: chart-line-pulse 2s ease-in-out .4s infinite; }
        .chart-line-sl    { animation: chart-line-pulse 2s ease-in-out .8s infinite; }

        /* ── Live price overlay ─────────────────────────────────────────────  */
        @keyframes live-line-glow {
          0%,100% { box-shadow:0 0 6px 1px rgba(94,234,212,.25); opacity:.85; }
          50%     { box-shadow:0 0 18px 4px rgba(94,234,212,.55),0 0 40px 8px rgba(94,234,212,.18); opacity:1; }
        }
        @keyframes live-dot-beat {
          0%,100% { transform:scale(1);   box-shadow:0 0 0 0 rgba(94,234,212,.7); }
          50%     { transform:scale(1.5); box-shadow:0 0 0 5px rgba(94,234,212,0); }
        }
        @keyframes scan-sweep {
          0%   { transform:translateX(-100%); }
          100% { transform:translateX(350%); }
        }
        .overlay-live-line {
          position:absolute; left:0; right:68px; height:1.5px;
          transform:translateY(-50%);
          background:linear-gradient(90deg,transparent 0%,rgba(94,234,212,.15) 5%,rgba(94,234,212,.85) 40%,rgba(94,234,212,.85) 60%,rgba(94,234,212,.15) 95%,transparent 100%);
          animation:live-line-glow 1.6s ease-in-out infinite;
          pointer-events:none;
        }
        .overlay-live-line::before {
          content:""; position:absolute; top:0; left:0; right:0; bottom:0;
          background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.55) 50%,transparent 100%);
          background-size:40% 100%;
          animation:scan-sweep 2.4s ease-in-out infinite;
        }
        .overlay-live-dot {
          position:absolute; left:6px; width:8px; height:8px; border-radius:50%;
          background:#5eead4; transform:translateY(-50%);
          animation:live-dot-beat 1.6s ease-in-out infinite; z-index:2;
        }
        .overlay-live-badge {
          position:absolute; left:20px; transform:translateY(-50%);
          background:linear-gradient(90deg,rgba(94,234,212,.18),rgba(94,234,212,.06));
          border:1px solid rgba(94,234,212,.45); border-radius:5px;
          padding:1px 7px; font-size:10px; font-weight:900; color:#5eead4;
          letter-spacing:.04em; white-space:nowrap; z-index:2;
          text-shadow:0 0 8px rgba(94,234,212,.6);
        }

        /* ── Entry line ─────────────────────────────────────────────────────  */
        @keyframes entry-glow {
          0%,100% { box-shadow:0 0 4px 0 rgba(163,177,194,.2); opacity:.6; }
          50%     { box-shadow:0 0 12px 2px rgba(163,177,194,.4); opacity:1; }
        }
        .overlay-entry-line {
          position:absolute; left:0; right:68px; height:1px; transform:translateY(-50%);
          background:repeating-linear-gradient(90deg,rgba(163,177,194,.8) 0 6px,transparent 6px 12px);
          animation:entry-glow 2s ease-in-out infinite; pointer-events:none;
        }
        .overlay-entry-badge {
          position:absolute; left:8px; transform:translateY(-50%);
          background:rgba(163,177,194,.12); border:1px solid rgba(163,177,194,.35);
          border-radius:4px; padding:1px 6px; font-size:9px; font-weight:900;
          color:rgba(163,177,194,.9); letter-spacing:.05em; white-space:nowrap; z-index:2;
        }

        /* ── TP line ────────────────────────────────────────────────────────  */
        @keyframes tp-glow {
          0%,100% { box-shadow:0 0 6px 0 rgba(0,208,160,.2); opacity:.7; }
          50%     { box-shadow:0 0 18px 4px rgba(0,208,160,.5); opacity:1; }
        }
        .overlay-tp-line {
          position:absolute; left:0; right:68px; height:1.5px; transform:translateY(-50%);
          background:repeating-linear-gradient(90deg,rgba(0,208,160,.9) 0 8px,transparent 8px 14px);
          animation:tp-glow 1.8s ease-in-out infinite; pointer-events:none;
        }
        .overlay-tp-badge {
          position:absolute; left:8px; transform:translateY(-50%);
          background:linear-gradient(90deg,rgba(0,208,160,.2),rgba(0,208,160,.06));
          border:1px solid rgba(0,208,160,.5); border-radius:4px; padding:1px 6px;
          font-size:9px; font-weight:900; color:#00d4a0; letter-spacing:.05em;
          white-space:nowrap; z-index:2; text-shadow:0 0 6px rgba(0,208,160,.5);
        }
        @keyframes tp-badge-pulse {
          0%,100% { box-shadow:0 0 0 0 rgba(0,208,160,.4); }
          50%     { box-shadow:0 0 0 4px rgba(0,208,160,0); }
        }
        .overlay-tp-badge { animation:tp-badge-pulse 1.8s ease-in-out infinite; }

        /* ── SL line ────────────────────────────────────────────────────────  */
        @keyframes sl-glow {
          0%,100% { box-shadow:0 0 6px 0 rgba(255,45,95,.2); opacity:.7; }
          50%     { box-shadow:0 0 18px 4px rgba(255,45,95,.5); opacity:1; }
        }
        .overlay-sl-line {
          position:absolute; left:0; right:68px; height:1.5px; transform:translateY(-50%);
          background:repeating-linear-gradient(90deg,rgba(255,45,95,.9) 0 8px,transparent 8px 14px);
          animation:sl-glow 1.8s ease-in-out .3s infinite; pointer-events:none;
        }
        .overlay-sl-badge {
          position:absolute; left:8px; transform:translateY(-50%);
          background:linear-gradient(90deg,rgba(255,45,95,.2),rgba(255,45,95,.06));
          border:1px solid rgba(255,45,95,.5); border-radius:4px; padding:1px 6px;
          font-size:9px; font-weight:900; color:#ff2d5f; letter-spacing:.05em;
          white-space:nowrap; z-index:2; text-shadow:0 0 6px rgba(255,45,95,.5);
        }
        @keyframes sl-badge-pulse {
          0%,100% { box-shadow:0 0 0 0 rgba(255,45,95,.4); }
          50%     { box-shadow:0 0 0 4px rgba(255,45,95,0); }
        }
        .overlay-sl-badge { animation:sl-badge-pulse 1.8s ease-in-out .3s infinite; }

        /* ── Swing high/low labels ──────────────────────────────────────────  */
        .overlay-swing-label {
          position:absolute; display:none; align-items:center; gap:4px;
          transform:translate(-50%,-50%); pointer-events:none; z-index:3;
          font-size:9px; font-weight:800; letter-spacing:.02em; white-space:nowrap;
        }
        .overlay-swing-dot {
          width:5px; height:5px; border-radius:50%; flex-shrink:0;
          box-shadow:0 0 6px 1px currentColor;
        }
        .overlay-swing-text {
          padding:1px 5px; border-radius:4px; backdrop-filter:blur(2px);
        }
        .overlay-swing-label.swing-top { transform:translate(-50%,-160%); color:#f59e0b; }
        .overlay-swing-label.swing-top .overlay-swing-dot { background:#f59e0b; }
        .overlay-swing-label.swing-top .overlay-swing-text {
          background:rgba(245,158,11,.12); border:1px solid rgba(245,158,11,.4); color:#f59e0b;
        }
        .overlay-swing-label.swing-btm { transform:translate(-50%,60%); color:#06b6d4; }
        .overlay-swing-label.swing-btm .overlay-swing-dot { background:#06b6d4; }
        .overlay-swing-label.swing-btm .overlay-swing-text {
          background:rgba(6,182,212,.12); border:1px solid rgba(6,182,212,.4); color:#06b6d4;
        }
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
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
                    flash === "up"   ? "hdr-flash-up text-emerald-400"
                    : flash === "down" ? "hdr-flash-down text-red-400"
                    : "text-muted-foreground"
                  }`}
                >
                  {flash === "up" ? "▲" : flash === "down" ? "▼" : ""} ${fmtPrice(livePrice)}
                </span>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="hidden md:flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
            {!isBtc && <>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 h-[3px] bg-white/70 rounded" />EMA 200
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 h-[2px] bg-blue-500 rounded" />EMA 21
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 h-[2px] bg-yellow-400 rounded" />EMA 9
              </span>
            </>}
            {isBtc && <>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-5 h-[2px] bg-[#ff5d00] rounded" />ZZ
              </span>
            </>}
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

      {/* ── TP / SL / Entry label strip ─────────────────────────────────────── */}
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
                : isTp  ? "chart-line-tp border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : isSl  ? "chart-line-sl border-red-500/30 bg-red-500/10 text-red-400"
                :          "border-border/60 bg-muted/20 text-muted-foreground"
              }`}>
                <span className="inline-block w-3 h-[2px] rounded" style={{ background: spec.color }} />
                {spec.label}
              </div>
            );
          })}
        </div>
      )}

      {/* ── CHART + OVERLAY ─────────────────────────────────────────────────── */}
      <div className="relative" style={{ height }}>
        {/* lightweight-charts canvas */}
        <div ref={chartWrapRef} className="absolute inset-0" />

        {/* HTML overlay */}
        <div ref={overlayRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>

          {/* Live price line */}
          <div ref={liveLineRef} style={{ display: "none", position: "absolute", left: 0, right: 0 }}>
            <div className="overlay-live-dot" />
            <div className="overlay-live-line" />
            <div className="overlay-live-badge">◆ LIVE &nbsp;${livePrice ? fmtPrice(livePrice) : "…"}</div>
          </div>

          {/* Entry line */}
          <div ref={entryLineRef} style={{ display: "none", position: "absolute", left: 0, right: 0 }}>
            <div className="overlay-entry-line" />
            <div className="overlay-entry-badge">── ENTRY</div>
          </div>

          {/* TP line */}
          <div ref={tpLineRef} style={{ display: "none", position: "absolute", left: 0, right: 0 }}>
            <div className="overlay-tp-line" />
            <div className="overlay-tp-badge">▲ TAKE PROFIT</div>
          </div>

          {/* SL line */}
          <div ref={slLineRef} style={{ display: "none", position: "absolute", left: 0, right: 0 }}>
            <div className="overlay-sl-line" />
            <div className="overlay-sl-badge">▼ STOP LOSS</div>
          </div>

          {/* Swing high/low price labels (populated imperatively in RAF) */}
          <div ref={zzLabelsContainerRef} className="absolute inset-0" />

        </div>
      </div>
    </div>
  );
}
