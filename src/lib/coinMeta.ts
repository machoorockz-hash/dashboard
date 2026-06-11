// Map asset symbol to logo url + full name.
// Uses jsdelivr-hosted cryptocurrency-icons (color, 128).
const NAMES: Record<string, string> = {
  BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", BNB: "BNB", XRP: "XRP",
  ADA: "Cardano", DOGE: "Dogecoin", AVAX: "Avalanche", USDT: "Tether",
  USDC: "USD Coin", MATIC: "Polygon", DOT: "Polkadot", LTC: "Litecoin",
  LINK: "Chainlink", TRX: "TRON", SHIB: "Shiba Inu", ATOM: "Cosmos",
  UNI: "Uniswap", ETC: "Ethereum Classic", BCH: "Bitcoin Cash",
  NEAR: "NEAR", APT: "Aptos", ARB: "Arbitrum", OP: "Optimism", SUI: "Sui",
  PEPE: "Pepe", FIL: "Filecoin", ICP: "Internet Computer",
  SYRUP: "Maple", REEF: "Reef", LAZIO: "Lazio Fan Token", ATM: "Atletico Madrid",
  ASR: "AS Roma", BTTRX: "BitTorrent", BUSD: "Binance USD", FDUSD: "FDUSD",
};

export function coinName(symbol: string): string {
  return NAMES[symbol.toUpperCase()] ?? symbol.toUpperCase();
}

export function coinLogo(symbol: string): string {
  const s = symbol.toLowerCase();
  return `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/${s}.png`;
}
