import Icon from "@/components/ui/icon";

// ── Slider input ─────────────────────────────────────────────────────────────
export function Slider({ label, value, min, max, step = 1, unit = "%", onChange, color }: {
  label: string; value: number; min: number; max: number; step?: number;
  unit?: string; onChange: (v: number) => void; color?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-muted-foreground">{label}</label>
        <span className="text-xs font-mono font-semibold text-foreground">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-cyan-500"
        style={color ? { accentColor: `hsl(${color})` } : {}}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

// ── Number input ─────────────────────────────────────────────────────────────
export function NumInput({ label, value, onChange, prefix, suffix, readOnly, hint }: {
  label: string; value: string; onChange?: (v: string) => void;
  prefix?: string; suffix?: string; readOnly?: boolean; hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-xs text-muted-foreground">{prefix}</span>}
        <input type="number" value={value} readOnly={readOnly}
          onChange={e => onChange?.(e.target.value)}
          className={`w-full py-2.5 text-sm rounded-lg border border-border font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors
            ${prefix ? "pl-7" : "pl-3"} ${suffix ? "pr-12" : "pr-3"}
            ${readOnly ? "bg-secondary/50 text-muted-foreground cursor-not-allowed" : "bg-secondary"}`}
        />
        {suffix && <span className="absolute right-3 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

// ── Row in detail table ──────────────────────────────────────────────────────
export function Row({ label, pct, rub, minus = true, bold, sep, color }: {
  label: string; pct?: string; rub: string;
  minus?: boolean; bold?: boolean; sep?: boolean; color?: string;
}) {
  return (
    <div className={`flex items-center justify-between py-2 text-xs ${sep ? "border-t border-border mt-1 pt-3" : "border-b border-border/50 last:border-0"}`}>
      <span className={bold ? "text-foreground font-medium" : "text-muted-foreground"}>{label}</span>
      <div className="flex items-center gap-3 font-mono">
        {pct && <span className="text-muted-foreground">{pct}</span>}
        <span className={bold ? "font-bold text-sm" : ""} style={color ? { color: `hsl(${color})` } : {}}>
          {minus && !bold ? "−" : ""}{rub}
        </span>
      </div>
    </div>
  );
}

// ── Block wrapper ────────────────────────────────────────────────────────────
export function Block({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border p-5" style={{ background: "hsl(var(--card))" }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: "hsla(195,90%,48%,0.12)" }}>
          <Icon name={icon} size={13} style={{ color: "hsl(var(--cyan))" }} />
        </div>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}
