import Icon from "@/components/ui/icon";

export const STEPS = [
  { n: 1, label: "Согласия" },
  { n: 2, label: "ИНН" },
  { n: 3, label: "Контакты" },
  { n: 4, label: "Маркетплейс" },
  { n: 5, label: "ЭДО" },
  { n: 6, label: "Доставка" },
  { n: 7, label: "Финансы" },
  { n: 8, label: "Активация" },
];

export interface CompanyData {
  company_id?: string;
  // step 1
  consent_offer: boolean;
  consent_pd: boolean;
  // step 2
  inn: string;
  full_name: string;
  short_name: string;
  kpp: string;
  ogrn: string;
  legal_address: string;
  director_name: string;
  entity_type: string;
  // step 3
  email: string;
  phone: string;
  contact_person: string;
  // step 4
  marketplace: string;
  ozon_client_id: string;
  ozon_api_key: string;
  ozon_warehouse_id: string;
  ym_api_key: string;
  ym_warehouse_id: string;
  // step 5
  edo_operator: string;
  // step 6
  delivery_method: string;
  delivery_city: string;
  // step 7
  purchase_limit: string;
}

export const INITIAL: CompanyData = {
  consent_offer: false,
  consent_pd: false,
  inn: "",
  full_name: "",
  short_name: "",
  kpp: "",
  ogrn: "",
  legal_address: "",
  director_name: "",
  entity_type: "legal",
  email: "",
  phone: "",
  contact_person: "",
  marketplace: "",
  ozon_client_id: "",
  ozon_api_key: "",
  ozon_warehouse_id: "",
  ym_api_key: "",
  ym_warehouse_id: "",
  edo_operator: "",
  delivery_method: "",
  delivery_city: "",
  purchase_limit: "0",
};

export function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        {STEPS.map((s) => (
          <div key={s.n} className="flex flex-col items-center gap-1.5 flex-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300 ${
                s.n < step
                  ? "bg-green-500 text-white"
                  : s.n === step
                  ? "text-white"
                  : "bg-secondary text-muted-foreground"
              }`}
              style={s.n === step ? { background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" } : {}}
            >
              {s.n < step ? <Icon name="Check" size={12} /> : s.n}
            </div>
            <span className={`text-[9px] font-medium hidden sm:block ${s.n === step ? "text-foreground" : "text-muted-foreground"}`}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
      <div className="h-0.5 rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${((step - 1) / (total - 1)) * 100}%`, background: "hsl(var(--cyan))" }}
        />
      </div>
    </div>
  );
}

export function Card({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-border p-8 animate-fade-in" style={{ background: "hsl(var(--card))" }}>
      <h2 className="text-lg font-semibold text-foreground mb-1">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>}
      {children}
    </div>
  );
}

export function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 mt-6">{children}</div>;
}

export function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export function Input({ value, onChange, placeholder, disabled, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
    />
  );
}

export function Checkbox({ checked, onChange, label, description }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div
        onClick={() => onChange(!checked)}
        className={`w-5 h-5 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border transition-all ${
          checked ? "border-transparent" : "border-border bg-secondary"
        }`}
        style={checked ? { background: "hsl(var(--cyan))" } : {}}
      >
        {checked && <Icon name="Check" size={11} style={{ color: "hsl(var(--primary-foreground))" }} />}
      </div>
      <div>
        <span className="text-sm text-foreground">{label}</span>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

export function RadioCard({ value, selected, onChange, title, description, icon }: {
  value: string; selected: string; onChange: (v: string) => void; title: string; description?: string; icon?: string;
}) {
  const active = selected === value;
  return (
    <button
      onClick={() => onChange(value)}
      className={`w-full text-left p-4 rounded-lg border transition-all ${
        active ? "border-ring" : "border-border hover:border-muted-foreground"
      }`}
      style={active ? { background: "hsla(195,90%,48%,0.06)" } : { background: "hsl(var(--secondary))" }}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: active ? "hsla(195,90%,48%,0.15)" : "hsl(var(--border))" }}>
            <Icon name={icon} size={15} style={{ color: active ? "hsl(var(--cyan))" : "hsl(var(--muted-foreground))" }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{title}</span>
            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all ${active ? "border-ring" : "border-border"}`}>
              {active && <div className="w-full h-full rounded-full scale-50" style={{ background: "hsl(var(--cyan))" }} />}
            </div>
          </div>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
    </button>
  );
}

export function NextButton({ onClick, disabled, loading, label = "Далее" }: {
  onClick: () => void; disabled?: boolean; loading?: boolean; label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}
    >
      {loading ? (
        <Icon name="Loader2" size={15} className="animate-spin" />
      ) : (
        <>
          {label}
          <Icon name="ArrowRight" size={14} />
        </>
      )}
    </button>
  );
}

export function ErrorBadge({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-lg px-3 py-2.5 mt-2">
      <Icon name="AlertCircle" size={13} />
      {message}
    </div>
  );
}
