// Shared SSE scan runner used by both the crossover and flat-line endpoints.
// Handles: interval validation, symbol fetching, chunked parallel scanning,
// progress/match/done/error event emission, and client-abort handling.

import { fetchTradingSymbols } from "./binance";

const DEFAULT_CHUNK = 15;

export type ScanMatchPayload = Record<string, unknown>;

export interface RunScanOptions {
  interval: string;
  validIntervals: Set<string>;
  chunkSize?: number;
  /** Returns a match payload, or null if the symbol doesn't qualify. */
  scanOne: (
    symbol: string,
    interval: string
  ) => Promise<ScanMatchPayload | null>;
}

function send(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  obj: unknown
) {
  try {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
  } catch {
    // controller already closed (client disconnected) — ignore.
  }
}

export async function runScanStream(
  request: Request,
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  opts: RunScanOptions
) {
  let interval = opts.interval;
  if (!opts.validIntervals.has(interval)) interval = "1h";
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK;

  try {
    send(controller, encoder, {
      type: "status",
      message: "Fetching Binance Futures exchange metadata…",
    });

    const symbols = await fetchTradingSymbols();
    send(controller, encoder, { type: "meta", total: symbols.length, interval });

    let scanned = 0;
    let matchCount = 0;

    for (let i = 0; i < symbols.length; i += chunkSize) {
      if (request.signal.aborted) break;

      const chunk = symbols.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map((sym) => opts.scanOne(sym, interval))
      );
      scanned += chunk.length;

      for (const r of results) {
        if (r) {
          matchCount += 1;
          send(controller, encoder, { type: "match", data: r });
        }
      }

      send(controller, encoder, {
        type: "progress",
        scanned,
        total: symbols.length,
        matches: matchCount,
      });
    }

    send(controller, encoder, {
      type: "done",
      matches: matchCount,
      total: symbols.length,
    });
  } catch (err) {
    send(controller, encoder, {
      type: "error",
      message: err instanceof Error ? err.message : "Scan failed unexpectedly.",
    });
  } finally {
    try {
      controller.close();
    } catch {
      // already closed
    }
  }
}

export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/** Clamp a number into [min, max]; falls back to `fallback` on NaN. */
export function clampNumber(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
