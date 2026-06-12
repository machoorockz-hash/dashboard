import { useMemo, useState } from "react";

interface Props {
  symbol: string;
  size?: number;
  className?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/**
 * Ordered list of sources to try for a coin logo.
 *
 * Source 1  — Our own server proxy: calls CoinGecko free API, caches 24 h,
 *             redirects to the real image. Covers EVERY coin CoinGecko knows.
 * Sources 2+ — Direct CDN fallbacks in case the server is unreachable.
 */
function buildSources(symbol: string): string[] {
  const lower = symbol.toLowerCase();
  const upper = symbol.toUpperCase();
  return [
    // 1. Server-side CoinGecko resolver — broadest coverage, cached 24 h
    `${API_BASE}/api/coin-logo/${upper}`,
    // 2. Binance CDN — all Binance-listed coins
    `https://bin.bnbstatic.com/static/assets/logo/${upper}.png`,
    // 3. atomiclabs — top ~500 coins
    `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/${lower}.png`,
    // 4. CoinCap
    `https://assets.coincap.io/assets/icons/${lower}@2x.png`,
    // 5. spothq
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${lower}.png`,
    // 6. ErikThiart — many smaller coins
    `https://raw.githubusercontent.com/ErikThiart/cryptocurrency-icons/master/16/${lower}.png`,
    // 7. Trust Wallet (Ethereum chain)
    `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${upper}/logo.png`,
  ];
}

export function CoinIcon({ symbol, size = 32, className = "" }: Props) {
  const sources = useMemo(() => buildSources(symbol), [symbol]);
  const [idx, setIdx] = useState(0);
  const sym = symbol.toUpperCase();

  // All sources exhausted → deterministic styled text avatar
  if (idx >= sources.length) {
    const { bg, fg, border } = symbolToColor(sym);
    return (
      <div
        className={`grid place-items-center rounded-full font-black shrink-0 select-none ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(8, Math.floor(size * 0.3)),
          background: bg,
          color: fg,
          border: `1.5px solid ${border}`,
        }}
      >
        {sym.slice(0, sym.length > 3 ? 3 : sym.length)}
      </div>
    );
  }

  return (
    <img
      key={`${sym}-${idx}`}
      src={sources[idx]}
      alt={sym}
      width={size}
      height={size}
      className={`rounded-full object-cover shrink-0 ${className}`}
      style={{ background: "transparent" }}
      onError={() => setIdx((i) => i + 1)}
      loading="lazy"
    />
  );
}

/** Deterministic pastel colour from coin symbol */
function symbolToColor(s: string): { bg: string; fg: string; border: string } {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return {
    bg:     `oklch(0.28 0.07 ${hue})`,
    fg:     `oklch(0.88 0.12 ${hue})`,
    border: `oklch(0.42 0.09 ${hue})`,
  };
}
