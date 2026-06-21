"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Radar,
  Square,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type SignalType = "current" | "delayed";

interface ScanMatch {
  symbol: string;
  currentPrice: number;
  twoAgoBB: number;
  prevBB: number;
  currentBB: number;
  signalType: SignalType;
}

type ScanStatus = "idle" | "scanning" | "done" | "stopped" | "error";

type SortKey = "symbol" | "price" | "currentBB" | "signalType";
type SortDir = "asc" | "desc";

const INTERVALS = [
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "4h", label: "4h" },
  { value: "1d", label: "1d" },
];

/** Format a crypto price with sensible precision across magnitudes. */
function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000)
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  if (n >= 1)
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function formatBB(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(4);
}

export default function Home() {
  const [interval, setIntervalValue] = useState<string>("1h");
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [phase, setPhase] = useState<string>(
    "Ready to scan. Pick a timeframe and hit Start Scan."
  );
  const [matches, setMatches] = useState<ScanMatch[]>([]);
  const [scanned, setScanned] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("signalType");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const abortRef = useRef<AbortController | null>(null);
  const matchesRef = useRef<ScanMatch[]>([]);
  matchesRef.current = matches;

  const scanning = status === "scanning";
  const matchCount = matches.length;
  const progressPct =
    total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0;

  const handleEvent = useCallback((evt: Record<string, unknown>) => {
    const type = evt.type as string;
    switch (type) {
      case "status":
        setPhase(String(evt.message ?? ""));
        break;
      case "meta":
        setTotal(Number(evt.total ?? 0));
        setScanned(0);
        setMatches([]);
        break;
      case "progress":
        setScanned(Number(evt.scanned ?? 0));
        break;
      case "match": {
        const data = evt.data as ScanMatch | undefined;
        if (data) {
          setMatches((prev) => [...prev, data]);
        }
        break;
      }
      case "done": {
        const count = Number(evt.matches ?? 0);
        const tot = Number(evt.total ?? 0);
        setScanned(tot);
        setPhase(
          `Scan complete — ${count} match${
            count === 1 ? "" : "es"
          } found across ${tot} symbols.`
        );
        setStatus("done");
        setLastUpdated(new Date());
        break;
      }
      case "error":
        setError(String(evt.message ?? "Unknown error"));
        setPhase("Scan failed.");
        setStatus("error");
        break;
    }
  }, []);

  const runScan = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("scanning");
    setError(null);
    setMatches([]);
    setScanned(0);
    setTotal(0);
    setPhase("Connecting to Binance Futures…");

    try {
      const res = await fetch(
        `/api/scan?interval=${encodeURIComponent(interval)}`,
        { signal: controller.signal }
      );
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
          const line = raw
            .split("\n")
            .find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            handleEvent(JSON.parse(payload) as Record<string, unknown>);
          } catch {
            // ignore malformed chunk
          }
        }
      }

      // If the stream ended without an explicit "done" event, finalize.
      setStatus((s) => (s === "scanning" ? "done" : s));
      setLastUpdated((d) => d ?? new Date());
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        const kept = matchesRef.current.length;
        setStatus("stopped");
        setPhase(
          `Scan stopped — kept ${kept} match${kept === 1 ? "" : "es"} found so far.`
        );
        setLastUpdated(new Date());
      } else {
        const msg =
          e instanceof Error ? e.message : "Connection failed unexpectedly.";
        setError(msg);
        setStatus("error");
        setPhase("Scan failed.");
      }
    } finally {
      abortRef.current = null;
    }
  }, [interval, handleEvent]);

  const stopScan = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Abort any in-flight scan if the component unmounts.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const sortedMatches = useMemo(() => {
    const arr = [...matches];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "price":
          cmp = a.currentPrice - b.currentPrice;
          break;
        case "currentBB":
          cmp = a.currentBB - b.currentBB;
          break;
        case "signalType":
          // "current" signals rank above "delayed"
          cmp =
            (a.signalType === "current" ? 1 : 0) -
            (b.signalType === "current" ? 1 : 0);
          if (cmp === 0) cmp = b.currentBB - a.currentBB;
          break;
      }
      return cmp * dir;
    });
    return arr;
  }, [matches, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "symbol" ? "asc" : "desc");
    }
  };

  const exportCsv = () => {
    if (sortedMatches.length === 0) return;
    const header = [
      "Symbol",
      "Current Price",
      "2 Candles Ago %B",
      "Prev Candle %B",
      "Current %B",
      "Signal",
      "Timeframe",
    ];
    const rows = sortedMatches.map((m) => [
      m.symbol,
      m.currentPrice,
      m.twoAgoBB.toFixed(6),
      m.prevBB.toFixed(6),
      m.currentBB.toFixed(6),
      m.signalType === "current" ? "Just Crossed (Current)" : "Crossed 1 Candle Ago",
      interval,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bb-screener-${interval}-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center size-9 rounded-lg bg-binance-yellow text-background">
              <Radar className="size-5" />
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-binance-yellow">
            Binance Futures Screener
          </h1>
          <p className="text-binance-muted mt-2 text-sm sm:text-base">
            Scanning for Bollinger Bands %B crossing above the 0 line — current
            candle or up to 2 candles ago.
          </p>
        </header>

        {/* Setup note */}
        <div className="rounded-lg border border-binance-green/30 bg-[#1b2621] px-4 py-3 mb-6 text-sm text-[#c5ebd4]">
          <div className="flex items-start gap-2">
            <Info className="size-4 mt-0.5 shrink-0 text-binance-green" />
            <div className="space-y-1">
              <p className="font-semibold text-binance-green">
                No browser setup required
              </p>
              <p className="text-[#c5ebd4]/80 leading-relaxed">
                All Binance API requests run on the server, so you no longer need
                a CORS browser extension. If the server region is geo-blocked by
                Binance, the scan will report a clear connection error instead of
                silently failing.
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <section className="rounded-xl bg-card border border-border shadow-xl p-4 sm:p-5 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:justify-between">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="interval-select"
                className="text-xs uppercase tracking-wide text-binance-muted"
              >
                Timeframe
              </label>
              <Select
                value={interval}
                onValueChange={setIntervalValue}
                disabled={scanning}
              >
                <SelectTrigger
                  id="interval-select"
                  className="w-[160px] bg-secondary border-border"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVALS.map((it) => (
                    <SelectItem key={it.value} value={it.value}>
                      {it.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              {scanning ? (
                <Button
                  variant="destructive"
                  onClick={stopScan}
                  className="min-w-[120px]"
                >
                  <Square className="size-4" />
                  Stop
                </Button>
              ) : (
                <Button
                  onClick={runScan}
                  className="min-w-[140px] bg-binance-yellow text-background hover:bg-binance-yellow/90 font-semibold"
                >
                  <Radar className="size-4" />
                  Start Scan
                </Button>
              )}
              <Button
                variant="outline"
                onClick={exportCsv}
                disabled={matchCount === 0 || scanning}
                className="border-border bg-secondary"
              >
                <Download className="size-4" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
            </div>
          </div>

          {/* Status + progress */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {scanning && (
                <Loader2 className="size-4 animate-spin text-binance-yellow" />
              )}
              {!scanning && status === "done" && matchCount > 0 && (
                <TrendingUp className="size-4 text-binance-green" />
              )}
              {!scanning && status === "error" && (
                <span className="size-2 rounded-full bg-binance-red" />
              )}
              <span
                className={cn(
                  "text-sm",
                  status === "error"
                    ? "text-binance-red"
                    : scanning
                    ? "text-binance-yellow"
                    : "text-binance-muted"
                )}
              >
                {phase}
              </span>
            </div>

            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-300 ease-out",
                  status === "error"
                    ? "bg-binance-red"
                    : status === "done"
                    ? "bg-binance-green"
                    : "bg-binance-yellow"
                )}
                style={{ width: `${scanning ? progressPct : status === "idle" ? 0 : 100}%` }}
              />
            </div>

            {/* Stat chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <StatChip label="Matches" value={String(matchCount)} accent="yellow" />
              <StatChip
                label="Scanned"
                value={total > 0 ? `${scanned} / ${total}` : "—"}
              />
              <StatChip
                label="Progress"
                value={total > 0 ? `${progressPct}%` : "—"}
              />
              <StatChip
                label="Timeframe"
                value={interval}
              />
              {lastUpdated && (
                <StatChip
                  label="Updated"
                  value={lastUpdated.toLocaleTimeString()}
                />
              )}
            </div>

            {error && (
              <p className="text-xs text-binance-red bg-binance-red/10 border border-binance-red/30 rounded-md px-3 py-2 mt-1">
                {error}
              </p>
            )}
          </div>
        </section>

        {/* Results table */}
        <section className="rounded-xl bg-card border border-border shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-binance-yellow" />
              <h2 className="text-sm font-semibold">Signal Results</h2>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-[11px] text-binance-muted">
              <LegendDot color="#0ecb81" label="Just crossed (current)" />
              <LegendDot color="#f3ba2f" label="Crossed 1 candle ago" />
            </div>
          </div>

          <div className="max-h-[58vh] overflow-y-auto binance-scroll">
            <table className="w-full text-sm">
              <TableHeader className="sticky top-0 z-10 bg-[#2b3139] shadow-[0_1px_0_rgba(0,0,0,0.4)]">
                <TableRow className="border-border hover:bg-transparent">
                  <SortableTh onClick={() => toggleSort("symbol")}>
                    Symbol{sortArrow("symbol")}
                  </SortableTh>
                  <SortableTh
                    onClick={() => toggleSort("price")}
                    className="text-right"
                  >
                    Current Price{sortArrow("price")}
                  </SortableTh>
                  <TableHead className="text-right text-binance-muted text-[11px] uppercase tracking-wide font-semibold">
                    2 Candles Ago %B
                  </TableHead>
                  <TableHead className="text-right text-binance-muted text-[11px] uppercase tracking-wide font-semibold">
                    Prev Candle %B
                  </TableHead>
                  <SortableTh
                    onClick={() => toggleSort("currentBB")}
                    className="text-right"
                  >
                    Current %B{sortArrow("currentBB")}
                  </SortableTh>
                  <SortableTh
                    onClick={() => toggleSort("signalType")}
                    className="text-right"
                  >
                    Signal{sortArrow("signalType")}
                  </SortableTh>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMatches.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="text-center py-14">
                      <EmptyState status={status} error={error} />
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedMatches.map((m) => (
                    <TableRow
                      key={m.symbol}
                      className="animate-in fade-in slide-in-from-bottom-1 duration-300 border-border"
                    >
                      <TableCell className="font-medium">
                        <a
                          href={`https://www.binance.com/en/futures/${m.symbol}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-foreground hover:text-binance-yellow transition-colors"
                        >
                          <span className="font-mono">{m.symbol}</span>
                          <ExternalLink className="size-3 opacity-50" />
                        </a>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatPrice(m.currentPrice)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono tabular-nums",
                          m.twoAgoBB > 0 ? "text-binance-green/90" : "text-binance-red/90"
                        )}
                      >
                        {formatBB(m.twoAgoBB)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono tabular-nums",
                          m.prevBB > 0 ? "text-binance-green/90" : "text-binance-red/90"
                        )}
                      >
                        {formatBB(m.prevBB)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono tabular-nums font-semibold",
                          m.currentBB > 0 ? "text-binance-green" : "text-binance-red"
                        )}
                      >
                        {formatBB(m.currentBB)}
                      </TableCell>
                      <TableCell className="text-right">
                        {m.signalType === "current" ? (
                          <Badge className="bg-binance-green text-background hover:bg-binance-green/90 border-transparent">
                            Just Crossed · Current
                          </Badge>
                        ) : (
                          <Badge className="bg-binance-yellow text-background hover:bg-binance-yellow/90 border-transparent">
                            Crossed 1 Candle Ago
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </table>
          </div>
        </section>

        <p className="text-[11px] text-binance-muted mt-3 text-center">
          Data sourced live from the Binance USDⓈ-M Futures API (BB period 20,
          stddev 2). For research purposes only — not financial advice.
        </p>
      </main>

      <footer className="mt-auto border-t border-border bg-card/60 backdrop-blur">
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-binance-muted">
          <p>
            Binance Futures BB %B Crossover Screener · server-side scanning
          </p>
          <p>Live data · No API key required</p>
        </div>
      </footer>
    </div>
  );
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "yellow" | "green";
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary border border-border px-2.5 py-1 text-xs">
      <span className="text-binance-muted">{label}:</span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          accent === "yellow"
            ? "text-binance-yellow"
            : accent === "green"
            ? "text-binance-green"
            : "text-foreground"
        )}
      >
        {value}
      </span>
    </span>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block size-2 rounded-sm"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function SortableTh({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <TableHead
      className={cn(
        "text-binance-muted text-[11px] uppercase tracking-wide font-semibold cursor-pointer select-none hover:text-binance-yellow transition-colors",
        className
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 text-left"
      >
        {children}
      </button>
    </TableHead>
  );
}

function EmptyState({
  status,
  error,
}: {
  status: ScanStatus;
  error: string | null;
}) {
  if (status === "scanning") {
    return (
      <div className="flex flex-col items-center gap-2 text-binance-muted">
        <Loader2 className="size-6 animate-spin text-binance-yellow" />
        <span>Scanning Binance Futures…</span>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-1 text-binance-red">
        <span className="font-semibold">Scan failed</span>
        <span className="text-xs text-binance-muted max-w-md">
          {error ?? "Could not reach Binance."}
        </span>
      </div>
    );
  }
  if (status === "done" || status === "stopped") {
    return (
      <div className="flex flex-col items-center gap-1 text-binance-muted">
        <span>No assets currently match the breakout target on this timeframe.</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 text-binance-muted">
      <Radar className="size-6 text-binance-yellow/60" />
      <span>No active scan run yet.</span>
    </div>
  );
}
