"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ScanStatus = "idle" | "scanning" | "done" | "stopped" | "error";

export interface ScanState<T> {
  status: ScanStatus;
  phase: string;
  matches: T[];
  scanned: number;
  total: number;
  error: string | null;
  lastUpdated: Date | null;
}

const INITIAL = <T,>(): ScanState<T> => ({
  status: "idle",
  phase: "Ready to scan. Adjust settings and hit Start Scan.",
  matches: [],
  scanned: 0,
  total: 0,
  error: null,
  lastUpdated: null,
});

/**
 * Generic SSE scan hook. Call `start(url)` to open the stream; the hook parses
 * status / meta / progress / match / done / error events and updates state.
 * `stop()` aborts the in-flight request.
 */
export function useScanStream<T>() {
  const [state, setState] = useState<ScanState<T>>(INITIAL<T>);
  const abortRef = useRef<AbortController | null>(null);
  const matchesRef = useRef<T[]>([]);

  const start = useCallback(async (url: string, initialPhase = "Connecting to Binance Futures…") => {
    const controller = new AbortController();
    abortRef.current = controller;
    matchesRef.current = [];

    setState({
      status: "scanning",
      phase: initialPhase,
      matches: [],
      scanned: 0,
      total: 0,
      error: null,
      lastUpdated: null,
    });

    const patch = (p: Partial<ScanState<T>> & { match?: T; resetMatches?: boolean }) => {
      setState((prev) => {
        let matches = prev.matches;
        if (p.resetMatches) {
          matches = [];
          matchesRef.current = [];
        }
        if (p.match !== undefined) {
          matches = [...matches, p.match];
          matchesRef.current = matches;
        }
        return {
          status: p.status ?? prev.status,
          phase: p.phase ?? prev.phase,
          matches,
          scanned: p.scanned ?? prev.scanned,
          total: p.total ?? prev.total,
          error: p.error !== undefined ? p.error : prev.error,
          lastUpdated: p.lastUpdated !== undefined ? p.lastUpdated : prev.lastUpdated,
        };
      });
    };

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok || !res.body) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = raw.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;

          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }

          switch (evt.type) {
            case "status":
              patch({ phase: String(evt.message ?? "") });
              break;
            case "meta":
              patch({
                total: Number(evt.total ?? 0),
                scanned: 0,
                resetMatches: true,
              });
              break;
            case "progress":
              patch({ scanned: Number(evt.scanned ?? 0) });
              break;
            case "match":
              patch({ match: evt.data as T });
              break;
            case "done": {
              const count = Number(evt.matches ?? 0);
              const tot = Number(evt.total ?? 0);
              patch({
                status: "done",
                scanned: tot,
                phase: `Scan complete — ${count} match${
                  count === 1 ? "" : "es"
                } found across ${tot} symbols.`,
                lastUpdated: new Date(),
              });
              break;
            }
            case "error":
              patch({
                status: "error",
                error: String(evt.message ?? "Unknown error"),
                phase: "Scan failed.",
              });
              break;
          }
        }
      }

      // If the stream ended without an explicit "done" event, finalize.
      setState((prev) =>
        prev.status === "scanning"
          ? { ...prev, status: "done", lastUpdated: prev.lastUpdated ?? new Date() }
          : prev
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        const kept = matchesRef.current.length;
        setState((prev) => ({
          ...prev,
          status: "stopped",
          phase: `Scan stopped — kept ${kept} match${kept === 1 ? "" : "es"} found so far.`,
          lastUpdated: new Date(),
        }));
      } else {
        const msg =
          e instanceof Error ? e.message : "Connection failed unexpectedly.";
        setState((prev) => ({
          ...prev,
          status: "error",
          error: msg,
          phase: "Scan failed.",
        }));
      }
    } finally {
      abortRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { ...state, start, stop };
}
