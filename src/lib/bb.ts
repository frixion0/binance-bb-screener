// Bollinger Bands %B calculation + straight-line detection utilities.
// Pure functions, no I/O. Shared by server scanning logic.

export const BB_PERIOD = 20;
export const BB_STDDEV = 2;
/** Default %B level a close must cross above to qualify as a crossover signal. */
export const CROSSOVER_TARGET = 0;

export interface BBResult {
  /** %B = (close - lowerBand) / (upperBand - lowerBand) */
  pctB: number;
  upperBand: number;
  middleBand: number;
  lowerBand: number;
}

/**
 * Compute Bollinger Bands and the %B value for `closePrice`.
 * `prices` should contain `period` closing values used for the SMA/stddev.
 * `period` and `stddev` are configurable.
 */
export function calculateBB(
  prices: number[],
  closePrice: number,
  period = BB_PERIOD,
  stddev = BB_STDDEV
): BBResult {
  const n = prices.length;
  if (n === 0) {
    return {
      pctB: 0,
      upperBand: closePrice,
      middleBand: closePrice,
      lowerBand: closePrice,
    };
  }
  const sum = prices.reduce((acc, p) => acc + p, 0);
  const mean = sum / n;
  const variance =
    prices.reduce((acc, p) => acc + (p - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  const upperBand = mean + stddev * stdDev;
  const lowerBand = mean - stddev * stdDev;

  const denom = upperBand - lowerBand;
  const pctB =
    denom === 0 ? (closePrice - lowerBand) / 1e-8 : (closePrice - lowerBand) / denom;

  return { pctB, upperBand, middleBand: mean, lowerBand };
}

/**
 * Compute the rolling %B series for a list of closes. Returns one %B value per
 * candle starting at index `period - 1` (the first candle with a full window).
 */
export function computePctBSeries(
  closes: number[],
  period: number,
  stddev: number
): number[] {
  const out: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const window = closes.slice(i - period + 1, i + 1);
    out.push(calculateBB(window, closes[i], period, stddev).pctB);
  }
  return out;
}

export interface LineFit {
  slope: number;
  intercept: number;
  /** Maximum absolute residual between actual values and the best-fit line. */
  maxDeviation: number;
}

/** Ordinary least-squares line fit through `values` (x = 0..n-1). */
export function fitLine(values: number[]): LineFit {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0, maxDeviation: 0 };
  if (n === 1) return { slope: 0, intercept: values[0], maxDeviation: 0 };

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  let maxDev = 0;
  for (let i = 0; i < n; i++) {
    maxDev = Math.max(maxDev, Math.abs(values[i] - (slope * i + intercept)));
  }
  return { slope, intercept, maxDeviation: maxDev };
}

export interface StraightRun {
  /** Number of consecutive candles in the straight-line segment. */
  runLength: number;
  /** Average %B across the run — the "level" of the line. */
  avgBB: number;
  /** Per-candle slope of the best-fit line (>0 uptrend, <0 downtrend, ~0 flat). */
  slope: number;
  /** Max deviation from the best-fit line (lower = straighter). */
  maxDeviation: number;
  /** 0 = run ends at the most recent candle, 1 = ended 1 candle ago, etc. */
  endOffset: number;
  /** %B values inside the run (for sparkline rendering). */
  values: number[];
}

export interface StraightRunOptions {
  /** Max allowed deviation from the best-fit line (straightness). */
  tolerance: number;
  /** Max allowed |slope| per candle (0 = perfectly horizontal). */
  maxSlope: number;
  /** Minimum candles required to qualify as a run. */
  minRunLength: number;
  /** How many recent %B candles to inspect. */
  lookback: number;
}

/**
 * Search the most recent `lookback` %B values for the longest consecutive run
 * that is "nearly a straight line" — i.e. the best-fit line's max residual is
 * within `tolerance` AND the slope is within ±`maxSlope`. Returns the longest
 * qualifying run (tie-broken toward the most recent). Returns null if none.
 *
 * For runs of exactly 2 candles the residual is always 0 (two points define a
 * line), so the `maxSlope` gate is what makes a 2-candle match meaningful
 * (the two values must be close together ≈ a flat segment).
 */
export function detectStraightRun(
  pctBSeries: number[],
  opts: StraightRunOptions
): StraightRun | null {
  const { tolerance, maxSlope, minRunLength, lookback } = opts;
  const series = pctBSeries.slice(-lookback);
  const n = series.length;
  if (n < 2) return null;

  let best: StraightRun | null = null;

  for (let e = n - 1; e >= 0; e--) {
    // Expand the run start backward while it remains "straight".
    let s = e;
    for (let start = e - 1; start >= 0; start--) {
      const candidate = series.slice(start, e + 1);
      const fit = fitLine(candidate);
      if (fit.maxDeviation <= tolerance && Math.abs(fit.slope) <= maxSlope) {
        s = start;
      } else {
        break;
      }
    }
    const runLength = e - s + 1;
    if (runLength >= minRunLength) {
      const values = series.slice(s, e + 1);
      const fit = fitLine(values);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const candidate: StraightRun = {
        runLength,
        avgBB: avg,
        slope: fit.slope,
        maxDeviation: fit.maxDeviation,
        endOffset: n - 1 - e,
        values,
      };
      if (!best || runLength > best.runLength) {
        best = candidate;
      }
    }
  }

  return best;
}
