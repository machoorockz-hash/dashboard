import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "../components/AppLayout";
import { CoinIcon } from "../components/CoinIcon";
import { coinName } from "../lib/coinMeta";
import { getAccount, getAllPrices, getTickers24h } from "../lib/binance";
import { useMemo } from "react";

function fmt(n: number, d = 2) {
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}

export default function AssetsPage() {
  const account = useQuery({ queryKey: ["account"], queryFn: () => getAccount(), refetchInterval: 60_000 });
  const prices = useQuery({ queryKey: ["prices"], queryFn: () => getAllPrices(), refetchInterval: 30_000 });

  const symbols = useMemo(() => {
    return account.data?.balances.filter((b) => b.asset !== "USDT").map((b) => `${b.asset}USDT`) ?? [];
  }, [account.data]);

  const tickers = useQuery({
    queryKey: ["tickers24h", symbols.join(",")],
    queryFn: () => getTickers24h({ data: { symbols } }),
    enabled: symbols.length > 0,
    refetchInterval: 60_000,
  });

  const tickerMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of tickers.data ?? []) m[t.symbol] = t.changePct;
    return m;
  }, [tickers.data]);

  const rows = useMemo(() => {
    if (!account.data || !prices.data) return [];
    return account.data.balances
      .map((b) => {
        const total = b.free + b.locked;
        const price = b.asset === "USDT" ? 1 : prices.data?.[`${b.asset}USDT`] ?? 0;
        const change24h = b.asset === "USDT" ? 0.01 : tickerMap[`${b.asset}USDT`] ?? 0;
        return { ...b, total, price, usd: total * price, change24h };
      })
      .sort((a, b) => b.usd - a.usd);
  }, [account.data, prices.data, tickerMap]);

  const totalUsd = rows.reduce((s, r) => s + r.usd, 0);
  const totalChangeUsd = rows.reduce((s, r) => s + (r.usd * r.change24h) / 100, 0);

  return (
    <AppLayout>
      <div className="space-y-5">
        <section className="grid gap-4 md:grid-cols-3">
          <Tile label="Total Portfolio Value" value={`$${fmt(totalUsd)}`} sub={`${rows.length} assets`} />
          <Tile label="24h Change" value={`${totalChangeUsd >= 0 ? "+" : ""}$${fmt(totalChangeUsd)}`}
            sub={`${totalUsd > 0 ? ((totalChangeUsd / totalUsd) * 100).toFixed(2) : "0"}%`}
            tone={totalChangeUsd >= 0 ? "bull" : "bear"} />
          <Tile label="Active Holdings" value={String(rows.length)} sub="Non-zero balance" tone="primary" />
        </section>

        <section className="rounded-2xl border border-border bg-card">
          <header className="px-5 py-4 border-b border-border"><h2 className="font-bold">Your Balances</h2></header>
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="text-left font-bold px-5 py-3">Asset</th>
                  <th className="text-right font-bold px-3 py-3">Price</th>
                  <th className="text-right font-bold px-3 py-3">24h</th>
                  <th className="text-right font-bold px-3 py-3">Free</th>
                  <th className="text-right font-bold px-3 py-3">Locked</th>
                  <th className="text-right font-bold px-5 py-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.asset} className="border-t border-border/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <CoinIcon symbol={r.asset} size={32} />
                        <div className="min-w-0">
                          <div className="font-bold">{r.asset}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{coinName(r.asset)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right px-3 py-3 font-mono">${fmt(r.price, r.price < 1 ? 4 : 2)}</td>
                    <td className={`text-right px-3 py-3 font-bold ${r.change24h >= 0 ? "text-bull" : "text-bear"}`}>
                      {r.change24h >= 0 ? "▲" : "▼"} {Math.abs(r.change24h).toFixed(2)}%
                    </td>
                    <td className="text-right px-3 py-3 font-mono">{fmt(r.free, 6)}</td>
                    <td className={`text-right px-3 py-3 font-mono ${r.locked > 0 ? "text-bear" : "text-muted-foreground"}`}>{fmt(r.locked, 6)}</td>
                    <td className="text-right px-5 py-3">
                      <div className="font-bold">{fmt(r.total, 6)}</div>
                      <div className="text-[11px] text-muted-foreground">${fmt(r.usd)}</div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted-foreground py-10">
                    {account.isLoading ? "Loading balances…" : "No balances found."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "bull" | "bear" | "primary" }) {
  const toneCls = tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : tone === "primary" ? "text-primary" : "";
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="text-xs text-muted-foreground font-semibold">{label}</div>
      <div className={`mt-2 text-3xl font-black ${toneCls}`}>{value}</div>
      {sub && <div className={`text-xs mt-1 font-medium ${toneCls || "text-muted-foreground"}`}>{sub}</div>}
    </div>
  );
}
