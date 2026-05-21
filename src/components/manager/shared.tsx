import Icon from "@/components/ui/icon";

export function Loader() {
  return <div className="flex justify-center py-20"><Icon name="Loader2" size={20} className="animate-spin text-muted-foreground" /></div>;
}
export function ErrMsg({ msg }: { msg: string }) {
  return <div className="flex items-center gap-2 text-sm text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-lg px-4 py-3"><Icon name="AlertCircle" size={15} />{msg}</div>;
}
export function SectionHdr({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-5">
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
export function Th({ c }: { c: React.ReactNode }) {
  return <th className="text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-5 py-3 whitespace-nowrap">{c}</th>;
}
export function Td({ c, mono }: { c: React.ReactNode; mono?: boolean }) {
  return <td className={`px-5 py-3 text-xs text-foreground ${mono ? "font-mono" : ""}`}>{c}</td>;
}
export function EmptyRow({ cols, text = "Нет данных" }: { cols: number; text?: string }) {
  return <tr><td colSpan={cols} className="px-5 py-10 text-center text-sm text-muted-foreground">{text}</td></tr>;
}
export function PriBtn({ onClick, label, icon, disabled }: { onClick: () => void; label: string; icon?: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:opacity-90 disabled:opacity-40"
      style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
      {icon && <Icon name={icon} size={13} />}{label}
    </button>
  );
}
export function SecBtn({ onClick, label, icon }: { onClick: () => void; label: string; icon?: string }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
      {icon && <Icon name={icon} size={13} />}{label}
    </button>
  );
}

export const ORDER_STATUS: Record<string, { l: string; c: string; bg: string }> = {
  new:        { l: "Новый",       c: "text-muted-foreground", bg: "bg-secondary" },
  confirmed:  { l: "Подтверждён", c: "text-blue-400",         bg: "bg-blue-400/10" },
  picked_up:  { l: "Забран",      c: "text-violet-400",       bg: "bg-violet-400/10" },
  in_transit: { l: "В пути",      c: "text-amber-400",        bg: "bg-amber-400/10" },
  delivered:  { l: "Доставлен",   c: "text-green-400",        bg: "bg-green-400/10" },
  cancelled:  { l: "Отменён",     c: "text-rose-400",         bg: "bg-rose-400/10" },
};
export const CLAIM_STATUS: Record<string, { l: string; c: string }> = {
  new:           { l: "Новая",              c: "text-muted-foreground" },
  reviewing:     { l: "На рассмотрении",    c: "text-blue-400" },
  decision_made: { l: "Решение предложено", c: "text-amber-400" },
  agreed:        { l: "Согласована",        c: "text-green-400" },
  disputed:      { l: "Оспорена",           c: "text-rose-400" },
  procedural:    { l: "Процессуальная",     c: "text-violet-400" },
  closed:        { l: "Закрыта",            c: "text-muted-foreground" },
};
export const INV_STATUS: Record<string, { l: string; c: string }> = {
  pending:   { l: "К оплате",  c: "text-amber-400" },
  paid:      { l: "Оплачен",   c: "text-green-400" },
  overdue:   { l: "Просрочен", c: "text-rose-400" },
  cancelled: { l: "Отменён",   c: "text-muted-foreground" },
};
export const CLAIM_TYPE: Record<string, string> = {
  delivery_refusal: "Отказ от доставки",
  return:           "Возврат",
  defect:           "Брак",
  damage:           "Повреждение",
};

export function Badge({ map, k }: { map: Record<string, { l: string; c: string; bg?: string }>; k: string }) {
  const s = map[k] || { l: k, c: "text-muted-foreground", bg: "" };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full inline-block ${s.c} ${s.bg || ""}`}>{s.l}</span>;
}

export function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "₽ " + Number(n).toLocaleString("ru", { maximumFractionDigits: 0 });
}
export function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "numeric" });
}
export function MetCard({ label, value, icon, color = "var(--cyan)", sub }: { label: string; value: string | number; icon: string; color?: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: "hsla(195,90%,48%,0.1)" }}>
          <Icon name={icon} size={13} style={{ color: `hsl(${color})` }} />
        </div>
      </div>
      <div className="font-mono font-semibold text-lg text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}
export function Input({ value, onChange, placeholder, type = "text", className = "" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring ${className}`} />;
}
export function Select({ value, onChange, options, className = "" }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={`px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-muted-foreground focus:outline-none ${className}`}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export function FieldLabel({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}{required && <span className="text-rose-400 ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}
