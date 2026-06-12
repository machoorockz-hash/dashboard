import { useMemo, useState } from "react";

interface Props {
  symbol: string;
  size?: number;
  className?: string;
}

/**
 * Tries multiple public CDN sources for coin logos in order.
 * Falls back to a styled text avatar if none resolve.
 *
 * Sources ranked by coverage (most → least):
 *  1. Binance CDN  — covers everything listed on Binance
 *  2. Trust Wallet — broad multi-chain coverage
 *  3. CoinGecko asset mirror (jsDelivr)
 *  4. atomiclabs cryptocurrency-icons (top ~500 coins)
 *  5. CoinCap
 *  6. spothq cryptocurrency-icons (additional coins)
 */
function buildSources(symbol: string): string[] {
  const lower = symbol.toLowerCase();
  const upper = symbol.toUpperCase();
  return [
    // Binance CDN — best coverage for all Binance-listed coins
    `https://bin.bnbstatic.com/static/assets/logo/${upper}.png`,
    // Trust Wallet assets (Ethereum mainnet — covers most ERC-20 tokens)
    `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${upper}/logo.png`,
    // Trust Wallet generic icon repo
    `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/assets/${upper}/logo.png`,
    // CoinGecko via jsDelivr mirror
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${lower}.svg`,
    // atomiclabs — top ~500 coins, 128px colour PNGs
    `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/${lower}.png`,
    // CoinCap
    `https://assets.coincap.io/assets/icons/${lower}@2x.png`,
    // spothq — slightly different set to atomiclabs
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${lower}.png`,
    // ErikThiart repo — covers many smaller/newer coins
    `https://raw.githubusercontent.com/ErikThiart/cryptocurrency-icons/master/16/${lower}.png`,
  ];
}

export function CoinIcon({ symbol, size = 32, className = "" }: Props) {
  const sources = useMemo(() => buildSources(symbol), [symbol]);
  const [idx, setIdx] = useState(0);
  const sym = symbol.toUpperCase();

  // All sources exhausted → text avatar
  if (idx >= sources.length) {
    const bg = stringToColor(sym);
    return (
      <div
        className={`grid place-items-center rounded-full font-black shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(8, Math.floor(size * 0.3)),
          background: bg.bg,
          color: bg.fg,
          border: `1px solid ${bg.border}`,
        }}
      >
        {sym.slice(0, 3)}
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
      className={`rounded-full object-cover bg-muted/40 shrink-0 ${className}`}
      onError={() => setIdx((i) => i + 1)}
      loading="lazy"
    />
  );
}

/** Deterministic pastel colour based on the symbol string */
function stringToColor(s: string): { bg: string; fg: string; border: string } {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return {
    bg:     `oklch(0.32 0.06 ${hue})`,
    fg:     `oklch(0.90 0.10 ${hue})`,
    border: `oklch(0.45 0.08 ${hue})`,
  };
}
