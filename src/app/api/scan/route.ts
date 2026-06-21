// SSE streaming screener endpoint.
// GET /api/scan?interval=1h
//
// Emits server-sent events of the form:
//   data: {"type":"status","message":"..."}
//   data: {"type":"meta","total":412}
//   data: {"type":"progress","scanned":30,"total":412,"matches":2}
//   data: {"type":"match","data":{...ScanMatch}}
//   data: {"type":"done","matches":5,"total":412}
//   data: {"type":"error","message":"..."}
//
// Running server-side means the browser needs no CORS extension or proxy.

import { fetchTradingSymbols, scanSymbol } from "@/lib/binance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_INTERVALS = new Set(["15m", "1h", "4h", "1d"]);
const CHUNK_SIZE = 15; // per-round parallelism against Binance

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let interval = searchParams.get("interval") || "1h";
  if (!VALID_INTERVALS.has(interval)) interval = "1h";

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          // controller already closed (client disconnected) — ignore.
        }
      };

      try {
        send({ type: "status", message: "Fetching Binance Futures exchange metadata…" });

        const symbols = await fetchTradingSymbols();
        send({ type: "meta", total: symbols.length, interval });

        let scanned = 0;
        let matchCount = 0;

        for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
          // Stop early if the client navigated away / aborted the request.
          if (request.signal.aborted) break;

          const chunk = symbols.slice(i, i + CHUNK_SIZE);
          const results = await Promise.all(
            chunk.map((sym) => scanSymbol(sym, interval))
          );
          scanned += chunk.length;

          for (const r of results) {
            if (r) {
              matchCount += 1;
              send({ type: "match", data: r });
            }
          }

          send({
            type: "progress",
            scanned,
            total: symbols.length,
            matches: matchCount,
          });
        }

        send({ type: "done", matches: matchCount, total: symbols.length });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Scan failed unexpectedly.";
        send({ type: "error", message });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
