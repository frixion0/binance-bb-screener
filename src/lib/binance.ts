// Server-side Binance Futures USDⓈ-M API client.
// All network calls happen here (Node runtime) so the browser never hits
// Binance directly — eliminating CORS / extension requirements entirely.

import { BB_PERIOD, CROSSOVER_TARGET, calculateBB } from "./bb";

const BASE_URL = "https://fapi.binance.com";

export type SignalType = "current" | "delayed";

export interface ScanMatch {
  symbol: string;
  currentPrice: number;
  twoAgoBB: number;
  prevBB: number;
  currentBB: number;
  signalType: SignalType;
}

/** Fetch every actively trading USDT/USDC perpetual symbol. */
export async function fetchTradingSymbols(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/fapi/v1/exchangeInfo`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Binance exchangeInfo returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    symbols: Array<{
      symbol: string;
      status: string;
      quoteAsset: string;
      contractType?: string;
    }>;
  };
  return data.symbols
    .filter(
      (s) =>
        s.status === "TRADING" &&
        (s.quoteAsset === "USDT" || s.quoteAsset === "USDC")
    )
    .map((s) => s.symbol)
    .sort();
}

/**
 * Fetch klines for one symbol and decide whether it qualifies as a BB %B
 * crossover signal (current candle or up to 2 candles ago). Returns null if
 * no match or if the request fails for any reason.
 */
export async function scanSymbol(
  symbol: string,
  interval: string
): Promise<ScanMatch | null> {
  try {
    const limit = BB_PERIOD + 8; // a few extra candles for the prior-window lookbacks
    const res = await fetch(
      `${BASE_URL}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      { cache: "no-store", headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;

    const klines = (await res.json()) as unknown;
    if (!Array.isArray(klines) || klines.length < limit) return null;

    const closes = (klines as unknown[][]).map((k) => parseFloat(String(k[4])));
    const len = closes.length;
    if (closes.some((c) => Number.isNaN(c))) return null;

    const currentBB = calculateBB(closes.slice(len - BB_PERIOD), closes[len - 1]);
    const prevBB = calculateBB(
      closes.slice(len - BB_PERIOD - 1, len - 1),
      closes[len - 2]
    );
    const twoAgoBB = calculateBB(
      closes.slice(len - BB_PERIOD - 2, len - 2),
      closes[len - 3]
    );

    // Signal: close crossed ABOVE the 0 line (%B) on the current candle.
    if (prevBB.pctB <= CROSSOVER_TARGET && currentBB.pctB > CROSSOVER_TARGET) {
      return {
        symbol,
        currentPrice: closes[len - 1],
        twoAgoBB: twoAgoBB.pctB,
        prevBB: prevBB.pctB,
        currentBB: currentBB.pctB,
        signalType: "current",
      };
    }

    // Delayed signal: crossed 1 candle ago and still holding above the line.
    if (
      twoAgoBB.pctB <= CROSSOVER_TARGET &&
      prevBB.pctB > CROSSOVER_TARGET &&
      currentBB.pctB > CROSSOVER_TARGET
    ) {
      return {
        symbol,
        currentPrice: closes[len - 1],
        twoAgoBB: twoAgoBB.pctB,
        prevBB: prevBB.pctB,
        currentBB: currentBB.pctB,
        signalType: "delayed",
      };
    }

    return null;
  } catch {
    // Swallow per-symbol errors so a single bad ticker can't abort the scan.
    return null;
  }
}
