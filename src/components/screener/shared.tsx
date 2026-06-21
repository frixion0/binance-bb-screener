"use client";

import { Loader2, Radar, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScanStatus } from "./use-scan-stream";

/** Format a crypto price with sensible precision across magnitudes. */
export function formatPrice(n: number): string {
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

export function formatBB(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "yellow" | "green" | "red";
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
            : accent === "red"
            ? "text-binance-red"
            : "text-foreground"
        )}
      >
        {value}
      </span>
    </span>
  );
}

export function ProgressBar({
  scanning,
  status,
  progressPct,
}: {
  scanning: boolean;
  status: ScanStatus;
  progressPct: number;
}) {
  const width = scanning ? progressPct : status === "idle" ? 0 : 100;
  return (
    <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-300 ease-out",
          status === "error"
            ? "bg-binance-red"
            : status === "done" || status === "stopped"
            ? "bg-binance-green"
            : "bg-binance-yellow"
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

/** Large, high-contrast scan control. */
export function ScanButton({
  scanning,
  onStart,
  onStop,
}: {
  scanning: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  if (scanning) {
    return (
      <Button
        onClick={onStop}
        className="h-12 px-8 text-base font-bold rounded-lg bg-binance-red text-white shadow-lg shadow-red-500/30 ring-1 ring-red-400/40 hover:brightness-110 hover:scale-[1.02] active:scale-100 transition-all min-w-[150px]"
      >
        <Square className="size-4 fill-current" />
        Stop Scan
      </Button>
    );
  }
  return (
    <Button
      onClick={onStart}
      className="h-12 px-8 text-base font-bold rounded-lg bg-binance-yellow text-background shadow-lg shadow-yellow-500/30 ring-1 ring-yellow-400/50 hover:brightness-110 hover:shadow-yellow-500/50 hover:scale-[1.02] active:scale-100 transition-all min-w-[150px]"
    >
      <Radar className="size-5" />
      Start Scan
    </Button>
  );
}

export function EmptyState({
  status,
  error,
  idleText = "No active scan run yet.",
  doneText = "No assets currently match the target on this timeframe.",
}: {
  status: ScanStatus;
  error: string | null;
  idleText?: string;
  doneText?: string;
}) {
  if (status === "scanning") {
    return (
      <div className="flex flex-col items-center gap-2 text-binance-muted py-10">
        <Loader2 className="size-7 animate-spin text-binance-yellow" />
        <span>Scanning Binance Futures…</span>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-1 text-binance-red py-10">
        <span className="font-semibold">Scan failed</span>
        <span className="text-xs text-binance-muted max-w-md text-center">
          {error ?? "Could not reach Binance."}
        </span>
      </div>
    );
  }
  if (status === "done" || status === "stopped") {
    return (
      <div className="flex flex-col items-center gap-1 text-binance-muted py-10">
        <span>{doneText}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1 text-binance-muted py-10">
      <Radar className="size-7 text-binance-yellow/60" />
      <span>{idleText}</span>
    </div>
  );
}
