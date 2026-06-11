import { useMemo, useState } from "react";

interface Props {
  symbol: string;
  size?: number;
  className?: string;
}

function buildSources(symbol: string): string[] {
  const lower = symbol.toLowerCase();
  const upper = symbol.toUpperCase();
  return [
    `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/${lower}.png`,
    `https://assets.coincap.io/assets/icons/${lower}@2x.png`,
    `https://bin.bnbstatic.com/static/assets/logo/${upper}.png`,
    `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${lower}.png`,
  ];
}

export function CoinIcon({ symbol, size = 32, className = "" }: Props) {
  const sources = useMemo(() => buildSources(symbol), [symbol]);
  const [idx, setIdx] = useState(0);
  const sym = symbol.toUpperCase();

  if (idx >= sources.length) {
    return (
      <div
        className={`grid place-items-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-foreground font-black ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(9, size * 0.32) }}
      >
        {sym.slice(0, 4)}
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
      className={`rounded-full bg-muted/40 ${className}`}
      onError={() => setIdx((i) => i + 1)}
      loading="lazy"
    />
  );
}
