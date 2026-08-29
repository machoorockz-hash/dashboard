const NAMES: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", BNB: "BNB", XRP: "XRP",
  ADA: "Cardano", DOGE: "Dogecoin", AVAX: "Avalanche", USDT: "Tether",
  USDC: "USD Coin", MATIC: "Polygon", DOT: "Polkadot", LTC: "Litecoin",
  LINK: "Chainlink", TRX: "TRON", SHIB: "Shiba Inu", ATOM: "Cosmos",
  UNI: "Uniswap", ETC: "Ethereum Classic", BCH: "Bitcoin Cash",
  NEAR: "NEAR", APT: "Aptos", ARB: "Arbitrum", OP: "Optimism", SUI: "Sui",
  PEPE: "Pepe", FIL: "Filecoin", ICP: "Internet Computer",
};

export function coinName(symbol: string): string {
  return NAMES[symbol.toUpperCase()] ?? symbol.toUpperCase();
}
