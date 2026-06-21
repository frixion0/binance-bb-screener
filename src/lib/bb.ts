// Bollinger Bands %B calculation utilities.
// Shared between server-side scanning logic. Pure functions, no I/O.

export const BB_PERIOD = 20;
export const BB_STDDEV = 2;
/** %B level the close must cross above to qualify as a signal. */
export const CROSSOVER_TARGET = 0;

export interface BBResult {
  /** %B = (close - lowerBand) / (upperBand - lowerBand) */
  pctB: number;
  upperBand: number;
  middleBand: number;
  lowerBand: number;
}

/**
 * Compute Bollinger Bands (period, stddev) and the %B value for `closePrice`.
 * `prices` must contain exactly BB_PERIOD closing values used for the SMA/stddev.
 */
export function calculateBB(prices: number[], closePrice: number): BBResult {
  const n = prices.length;
  if (n === 0) {
    return { pctB: 0, upperBand: closePrice, middleBand: closePrice, lowerBand: closePrice };
  }
  const sum = prices.reduce((acc, p) => acc + p, 0);
  const mean = sum / n;
  const variance = prices.reduce((acc, p) => acc + (p - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  const upperBand = mean + BB_STDDEV * stdDev;
  const lowerBand = mean - BB_STDDEV * stdDev;

  const denom = upperBand - lowerBand;
  const pctB = denom === 0 ? (closePrice - lowerBand) / 1e-8 : (closePrice - lowerBand) / denom;

  return { pctB, upperBand, middleBand: mean, lowerBand };
}
