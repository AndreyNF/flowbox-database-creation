import Icon from "@/components/ui/icon";

export function Loader() {
  return <div className="flex justify-center py-20"><Icon name="Loader2" size={22} className="animate-spin text-muted-foreground" /></div>;
}
export function ErrMsg({ msg }: { msg: string }) {
  return <div className="flex items-center gap-2 text-sm text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-lg px-4 py-3"><Icon name="AlertCircle" size={15} />{msg}</div>;
}
export function WarnMsg({ msg }: { msg: string }) {
  return <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3"><Icon name="AlertTriangle" size={13} />{msg}</div>;
}
export function SectionHdr({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border ${className}`} style={{ background: "hsl(var(--card))" }}>{children}</div>;
}
export function MetricCard({ label, value, sub, icon, color = "var(--cyan)", trend }: {
  label: string; value: string | number; sub?: string; icon: string; color?: string; trend?: { up: boolean; text: string };
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs text-muted-foreground leading-tight">{label}</span>
        <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ background: "hsla(195,90%,48%,0.1)" }}>
          <Icon name={icon} size={13} style={{ color: `hsl(${color})` }} />
        </div>
      </div>
      <div className="font-mono font-semibold text-lg text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      {trend && (
        <div className={`text-xs mt-1 flex items-center gap-1 ${trend.up ? "text-green-400" : "text-rose-400"}`}>
          <Icon name={trend.up ? "TrendingUp" : "TrendingDown"} size={11} />{trend.text}
        </div>
      )}
    </Card>
  );
}
export function Th({ c }: { c: React.ReactNode }) {
  return <th className="text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-4 py-3 whitespace-nowrap">{c}</th>;
}
export function Td({ c, mono, cls = "" }: { c: React.ReactNode; mono?: boolean; cls?: string }) {
  return <td className={`px-4 py-3 text-xs text-foreground ${mono ? "font-mono" : ""} ${cls}`}>{c}</td>;
}
export function EmptyRow({ cols, text = "Нет данных" }: { cols: number; text?: string }) {
  return <tr><td colSpan={cols} className="px-4 py-10 text-center text-sm text-muted-foreground">{text}</td></tr>;
}
export function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-green-400" : "bg-rose-400"}`} />;
}

const ROLE_COLORS: Record<string, string> = {
  admin:           "text-violet-400 bg-violet-400/10",
  manager:         "text-blue-400 bg-blue-400/10",
  client:          "text-green-400 bg-green-400/10",
  logist:          "text-orange-400 bg-orange-400/10",
  product_manager: "text-yellow-400 bg-yellow-400/10",
};
const ROLE_LABELS: Record<string, string> = {
  admin: "Админ", manager: "Менеджер", client: "Клиент",
  logist: "Логист", product_manager: "Прод. менеджер",
};
export function RoleBadge({ role }: { role: string }) {
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[role] || "text-muted-foreground bg-secondary"}`}>{ROLE_LABELS[role] || role}</span>;
}

export function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return "₽\u00a0" + Number(n).toLocaleString("ru", { maximumFractionDigits: 0 });
}
export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "numeric" });
}
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="relative w-full max-w-lg rounded-xl border border-border shadow-2xl animate-fade-in" style={{ background: "hsl(var(--card))" }}>
        <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground z-10">
          <Icon name="X" size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}

export function PriBtn({ onClick, label, icon, disabled, loading }: {
  onClick: () => void; label: string; icon?: string; disabled?: boolean; loading?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled || loading}
      className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:opacity-90 disabled:opacity-40"
      style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
      {loading ? <Icon name="Loader2" size={12} className="animate-spin" /> : icon ? <Icon name={icon} size={12} /> : null}
      {label}
    </button>
  );
}
export function SecBtn({ onClick, label, icon, cls = "" }: { onClick: () => void; label: string; icon?: string; cls?: string }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors ${cls}`}>
      {icon && <Icon name={icon} size={12} />}{label}
    </button>
  );
}
