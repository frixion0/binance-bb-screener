"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export interface SettingSpec {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint?: string;
  onChange: (v: number) => void;
}

const INTERVALS = [
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "4h", label: "4h" },
  { value: "1d", label: "1d" },
];

/**
 * Collapsible-style settings card. Renders the shared controls (timeframe, BB
 * period, BB stddev) plus any mode-specific `SettingSpec` rows passed in.
 */
export function SettingsPanel({
  interval,
  onIntervalChange,
  commonSettings,
  extraSettings,
  disabled,
  onReset,
  description,
}: {
  interval: string;
  onIntervalChange: (v: string) => void;
  commonSettings: SettingSpec[];
  extraSettings: SettingSpec[];
  disabled: boolean;
  onReset: () => void;
  description?: string;
}) {
  const allSettings = [...commonSettings, ...extraSettings];

  return (
    <section className="rounded-xl bg-card border border-border shadow-xl p-4 sm:p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-binance-yellow" />
          <h2 className="text-sm font-semibold">Scan Settings</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={disabled}
          className="text-binance-muted hover:text-binance-yellow"
        >
          <RotateCcw className="size-3.5" />
          Reset
        </Button>
      </div>

      {description && (
        <p className="text-xs text-binance-muted mb-4 leading-relaxed">
          {description}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Timeframe */}
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-binance-muted">
            Timeframe
          </Label>
          <Select
            value={interval}
            onValueChange={onIntervalChange}
            disabled={disabled}
          >
            <SelectTrigger className="w-full bg-secondary border-border">
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

        {/* Numeric sliders */}
        {allSettings.map((s) => (
          <div key={s.key} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-binance-muted">
                {s.label}
              </Label>
              <span className="text-xs font-mono font-semibold text-binance-yellow tabular-nums">
                {s.value}
              </span>
            </div>
            <Slider
              value={[s.value]}
              min={s.min}
              max={s.max}
              step={s.step}
              onValueChange={(v) => s.onChange(v[0])}
              disabled={disabled}
              className="[&_[data-slot=slider-range]]:bg-binance-yellow [&_[data-slot=slider-thumb]]:border-binance-yellow"
            />
            {s.hint && (
              <span className="text-[10px] text-binance-muted/80 leading-tight">
                {s.hint}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
