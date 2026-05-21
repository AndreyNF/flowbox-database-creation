import { useState, useCallback } from "react";
import Icon from "@/components/ui/icon";

const API_SAVE = "https://functions.poehali.dev/daec4c15-d79a-4154-a716-8690c622dd46";
const API_DADATA = "https://functions.poehali.dev/0a0add78-6b3a-48c1-8984-0e1180e72ad3";
const API_ACTIVATE = "https://functions.poehali.dev/9c14a054-f07d-49fd-a318-b881deb30d70";
const API_OZON_VALIDATE = "https://functions.poehali.dev/45eda92a-8064-497b-8e6e-73242579a867";

const STEPS = [
  { n: 1, label: "Согласия" },
  { n: 2, label: "ИНН" },
  { n: 3, label: "Контакты" },
  { n: 4, label: "Маркетплейс" },
  { n: 5, label: "ЭДО" },
  { n: 6, label: "Доставка" },
  { n: 7, label: "Финансы" },
  { n: 8, label: "Активация" },
];

interface CompanyData {
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

const INITIAL: CompanyData = {
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

function ProgressBar({ step, total }: { step: number; total: number }) {
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

function Card({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-border p-8 animate-fade-in" style={{ background: "hsl(var(--card))" }}>
      <h2 className="text-lg font-semibold text-foreground mb-1">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>}
      {children}
    </div>
  );
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 mt-6">{children}</div>;
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, disabled, type = "text" }: {
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

function Checkbox({ checked, onChange, label, description }: {
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

function RadioCard({ value, selected, onChange, title, description, icon }: {
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

function NextButton({ onClick, disabled, loading, label = "Далее" }: {
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

function ErrorBadge({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-lg px-3 py-2.5 mt-2">
      <Icon name="AlertCircle" size={13} />
      {message}
    </div>
  );
}

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<CompanyData>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [innLoading, setInnLoading] = useState(false);
  const [innFound, setInnFound] = useState(false);
  const [ozonValidating, setOzonValidating] = useState(false);
  const [ozonValid, setOzonValid] = useState(false);
  const [ozonWarehouses, setOzonWarehouses] = useState<{id: string; name: string}[]>([]);

  const set = useCallback((key: keyof CompanyData, val: string | boolean) => {
    setData(prev => ({ ...prev, [key]: val }));
    setError("");
  }, []);

  async function saveStep(stepNum: number, payload: Record<string, unknown>) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API_SAVE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: stepNum, company_id: data.company_id, ...payload }),
      });
      const json = JSON.parse(await res.text());
      if (!res.ok) throw new Error(json.error || "Ошибка сервера");
      if (json.company_id) setData(prev => ({ ...prev, company_id: json.company_id }));
      setStep(stepNum + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function lookupINN(inn: string) {
    if (inn.length < 10) return;
    setInnLoading(true);
    setInnFound(false);
    setError("");
    try {
      const res = await fetch(`${API_DADATA}?inn=${inn}`);
      const json = JSON.parse(await res.text());
      if (!res.ok) throw new Error(json.error || "Компания не найдена");
      setData(prev => ({
        ...prev,
        full_name: json.full_name || "",
        short_name: json.short_name || "",
        kpp: json.kpp || "",
        ogrn: json.ogrn || "",
        legal_address: json.legal_address || "",
        director_name: json.director_name || "",
        entity_type: json.entity_type || "legal",
      }));
      setInnFound(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка поиска");
    } finally {
      setInnLoading(false);
    }
  }

  async function validateOzon() {
    if (!data.ozon_client_id || !data.ozon_api_key) return;
    setOzonValidating(true);
    setOzonValid(false);
    setOzonWarehouses([]);
    setError("");
    try {
      const res = await fetch(API_OZON_VALIDATE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: data.ozon_client_id, api_key: data.ozon_api_key }),
      });
      const json = JSON.parse(await res.text());
      if (!res.ok) throw new Error(json.error || "Ошибка проверки ключа");
      setOzonValid(true);
      setOzonWarehouses(json.warehouses || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка валидации Ozon");
    } finally {
      setOzonValidating(false);
    }
  }

  async function activate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API_ACTIVATE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: data.company_id }),
      });
      const json = JSON.parse(await res.text());
      if (!res.ok) throw new Error(json.error || "Ошибка активации");
      setStep(9);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  const showOzon = data.marketplace === "ozon" || data.marketplace === "both";
  const showYM = data.marketplace === "yandex_market" || data.marketplace === "both";

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "hsl(var(--background))" }}>
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: "hsl(var(--cyan))" }}>
            <span className="text-sm font-mono font-semibold" style={{ color: "hsl(var(--primary-foreground))" }}>F</span>
          </div>
          <span className="font-semibold text-foreground">FlowBox</span>
        </div>

        {step < 9 && (
          <div className="mb-8">
            <ProgressBar step={step} total={8} />
          </div>
        )}

        {/* Step 1 — Consents */}
        {step === 1 && (
          <Card title="Добро пожаловать в FlowBox" subtitle="Перед началом необходимо ознакомиться и принять документы">
            <FieldGroup>
              <Checkbox
                checked={data.consent_offer}
                onChange={v => set("consent_offer", v)}
                label="Принимаю Публичную оферту"
                description="Условия использования платформы и договор на обслуживание"
              />
              <Checkbox
                checked={data.consent_pd}
                onChange={v => set("consent_pd", v)}
                label="Согласен на обработку персональных данных"
                description="В соответствии с ФЗ-152 «О персональных данных»"
              />
            </FieldGroup>
            {error && <ErrorBadge message={error} />}
            <div className="mt-6">
              <NextButton
                onClick={() => saveStep(1, { consents_accepted: true })}
                disabled={!data.consent_offer || !data.consent_pd}
                loading={loading}
              />
            </div>
          </Card>
        )}

        {/* Step 2 — INN */}
        {step === 2 && (
          <Card title="Данные компании" subtitle="Введите ИНН — мы заполним реквизиты автоматически">
            <FieldGroup>
              <Field label="ИНН компании или ИП" required>
                <div className="relative">
                  <Input
                    value={data.inn}
                    onChange={v => {
                      set("inn", v);
                      setInnFound(false);
                      if (v.length === 10 || v.length === 12) lookupINN(v);
                    }}
                    placeholder="10 или 12 цифр"
                  />
                  {innLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Icon name="Loader2" size={14} className="animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {innFound && !innLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Icon name="CheckCircle" size={14} className="text-green-400" />
                    </div>
                  )}
                </div>
              </Field>

              {innFound && (
                <div className="rounded-lg border border-border p-4 space-y-2 animate-fade-in"
                  style={{ background: "hsl(var(--secondary))" }}>
                  <div className="flex items-center gap-2 text-xs text-green-400 mb-2">
                    <Icon name="CheckCircle" size={12} /> Компания найдена
                  </div>
                  {[
                    { label: "Полное наименование", value: data.full_name },
                    { label: "Краткое наименование", value: data.short_name },
                    { label: "Юридический адрес", value: data.legal_address },
                    { label: "Руководитель", value: data.director_name },
                    { label: "КПП", value: data.kpp },
                    { label: "ОГРН", value: data.ogrn },
                  ].map(f => f.value ? (
                    <div key={f.label} className="flex gap-2">
                      <span className="text-xs text-muted-foreground w-40 flex-shrink-0">{f.label}:</span>
                      <span className="text-xs text-foreground">{f.value}</span>
                    </div>
                  ) : null)}
                </div>
              )}
            </FieldGroup>
            {error && <ErrorBadge message={error} />}
            <div className="mt-6">
              <NextButton
                onClick={() => saveStep(2, {
                  inn: data.inn, full_name: data.full_name, short_name: data.short_name,
                  kpp: data.kpp, ogrn: data.ogrn, legal_address: data.legal_address,
                  director_name: data.director_name, entity_type: data.entity_type,
                })}
                disabled={!data.inn || !innFound}
                loading={loading}
              />
            </div>
          </Card>
        )}

        {/* Step 3 — Contacts */}
        {step === 3 && (
          <Card title="Контактные данные" subtitle="Как с вами связаться">
            <FieldGroup>
              <Field label="Email" required>
                <Input value={data.email} onChange={v => set("email", v)} placeholder="company@example.ru" type="email" />
              </Field>
              <Field label="Телефон" required>
                <Input value={data.phone} onChange={v => set("phone", v)} placeholder="+7 (999) 000-00-00" />
              </Field>
              <Field label="Контактное лицо" required>
                <Input value={data.contact_person} onChange={v => set("contact_person", v)} placeholder="ФИО менеджера" />
              </Field>
            </FieldGroup>
            {error && <ErrorBadge message={error} />}
            <div className="mt-6">
              <NextButton
                onClick={() => saveStep(3, { email: data.email, phone: data.phone, contact_person: data.contact_person })}
                disabled={!data.email || !data.phone || !data.contact_person}
                loading={loading}
              />
            </div>
          </Card>
        )}

        {/* Step 4 — Marketplace */}
        {step === 4 && (
          <Card title="Маркетплейс" subtitle="Выберите площадку и укажите API-ключ">
            <FieldGroup>
              <Field label="Площадка" required>
                <div className="space-y-2">
                  <RadioCard value="ozon" selected={data.marketplace}
                    onChange={v => { set("marketplace", v); setOzonValid(false); setOzonWarehouses([]); }}
                    title="Ozon" description="realFBS — отгрузка со своего склада" icon="ShoppingBag" />
                  <RadioCard value="yandex_market" selected={data.marketplace}
                    onChange={v => { set("marketplace", v); setOzonValid(false); }}
                    title="Яндекс Маркет" description="FBS / DBS" icon="Store" />
                  <RadioCard value="both" selected={data.marketplace}
                    onChange={v => { set("marketplace", v); setOzonValid(false); setOzonWarehouses([]); }}
                    title="Ozon + Яндекс Маркет" description="Оба маркетплейса одновременно" icon="Layers" />
                </div>
              </Field>

              {showOzon && (
                <>
                  <Field label="Ozon Client ID" required>
                    <Input
                      value={data.ozon_client_id}
                      onChange={v => { set("ozon_client_id", v); setOzonValid(false); setOzonWarehouses([]); }}
                      placeholder="Числовой идентификатор продавца"
                    />
                  </Field>
                  <Field label="Ozon API-ключ" required>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Input
                          value={data.ozon_api_key}
                          onChange={v => { set("ozon_api_key", v); setOzonValid(false); setOzonWarehouses([]); }}
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        />
                        {ozonValid && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Icon name="CheckCircle" size={14} className="text-green-400" />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={validateOzon}
                        disabled={!data.ozon_client_id || !data.ozon_api_key || ozonValidating}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-ring transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                      >
                        {ozonValidating
                          ? <Icon name="Loader2" size={13} className="animate-spin" />
                          : <Icon name="Zap" size={13} />
                        }
                        {ozonValidating ? "Проверка..." : "Проверить"}
                      </button>
                    </div>
                  </Field>

                  {ozonValid && (
                    <div className="animate-fade-in">
                      <div className="flex items-center gap-2 text-xs text-green-400 mb-2">
                        <Icon name="CheckCircle" size={12} /> Ключ действителен · найдено {ozonWarehouses.length} склад(ов)
                      </div>
                      {ozonWarehouses.length > 0 && (
                        <Field label="Склад отгрузки">
                          <select
                            value={data.ozon_warehouse_id}
                            onChange={e => set("ozon_warehouse_id", e.target.value)}
                            className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="">— Выберите склад —</option>
                            {ozonWarehouses.map(w => (
                              <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                          </select>
                        </Field>
                      )}
                    </div>
                  )}
                </>
              )}

              {showYM && (
                <>
                  <Field label="Яндекс Маркет OAuth-токен" required>
                    <Input value={data.ym_api_key} onChange={v => set("ym_api_key", v)} placeholder="y0_Ag..." />
                  </Field>
                  <Field label="ID кампании">
                    <Input value={data.ym_warehouse_id} onChange={v => set("ym_warehouse_id", v)} placeholder="campaign_id" />
                  </Field>
                </>
              )}
            </FieldGroup>
            {error && <ErrorBadge message={error} />}
            <div className="mt-6">
              <NextButton
                onClick={() => saveStep(4, {
                  marketplace: data.marketplace,
                  ozon_api_key: data.ozon_api_key,
                  ozon_warehouse_id: data.ozon_warehouse_id,
                  ym_api_key: data.ym_api_key,
                  ym_warehouse_id: data.ym_warehouse_id,
                })}
                disabled={
                  !data.marketplace ||
                  (showOzon && (!data.ozon_client_id || !data.ozon_api_key || !ozonValid)) ||
                  (showYM && !data.ym_api_key)
                }
                loading={loading}
              />
            </div>
          </Card>
        )}

        {/* Step 5 — EDO */}
        {step === 5 && (
          <Card title="Электронный документооборот" subtitle="Выберите вашего ЭДО-оператора">
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2.5 mb-2 mt-2">
              <Icon name="AlertTriangle" size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-400">Обязательно для всех участников с 01.09.2026 (ФНС)</p>
            </div>
            <FieldGroup>
              <Field label="ЭДО-оператор" required>
                <div className="space-y-2">
                  {[
                    { value: "diadoc", title: "Диадок (Контур)", description: "СКБ Контур" },
                    { value: "sbis", title: "СБИС", description: "Тензор" },
                    { value: "1c_edo", title: "1С-ЭДО", description: "1С" },
                    { value: "other", title: "Другой оператор", description: "Укажем при подключении" },
                  ].map(opt => (
                    <RadioCard key={opt.value} value={opt.value} selected={data.edo_operator}
                      onChange={v => set("edo_operator", v)} title={opt.title} description={opt.description} />
                  ))}
                </div>
              </Field>
            </FieldGroup>
            {error && <ErrorBadge message={error} />}
            <div className="mt-6">
              <NextButton
                onClick={() => saveStep(5, { edo_operator: data.edo_operator || null })}
                loading={loading}
                label={data.edo_operator ? "Далее" : "Пропустить"}
              />
            </div>
          </Card>
        )}

        {/* Step 6 — Delivery */}
        {step === 6 && (
          <Card title="Способ доставки" subtitle="Как мы будем доставлять заказы вашим клиентам">
            <FieldGroup>
              <Field label="Метод доставки" required>
                <div className="space-y-2">
                  <RadioCard
                    value="ozon_partners"
                    selected={data.delivery_method}
                    onChange={v => set("delivery_method", v)}
                    title="Партнёры Ozon"
                    description="Города и ПВЗ настраиваются в кабинете маркетплейса"
                    icon="MapPin"
                  />
                  <RadioCard
                    value="our_service"
                    selected={data.delivery_method}
                    onChange={v => set("delivery_method", v)}
                    title="Наша служба доставки"
                    description="Тариф подтягивается автоматически по городу"
                    icon="Truck"
                  />
                </div>
              </Field>
              {data.delivery_method === "our_service" && (
                <Field label="Город доставки" required>
                  <Input value={data.delivery_city} onChange={v => set("delivery_city", v)} placeholder="Например: Москва" />
                </Field>
              )}
            </FieldGroup>
            {error && <ErrorBadge message={error} />}
            <div className="mt-6">
              <NextButton
                onClick={() => saveStep(6, {
                  delivery_method: data.delivery_method,
                  delivery_city: data.delivery_city || null,
                })}
                disabled={!data.delivery_method || (data.delivery_method === "our_service" && !data.delivery_city)}
                loading={loading}
              />
            </div>
          </Card>
        )}

        {/* Step 7 — Finance */}
        {step === 7 && (
          <Card title="Финансовые параметры" subtitle="Настройте лимит закупок">
            <FieldGroup>
              <Field label="Лимит закупки (₽)">
                <Input
                  value={data.purchase_limit}
                  onChange={v => set("purchase_limit", v)}
                  placeholder="0"
                  type="number"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Максимальная сумма активных заказов одновременно. 0 = без ограничений.
                </p>
              </Field>
            </FieldGroup>
            {error && <ErrorBadge message={error} />}
            <div className="mt-6">
              <NextButton
                onClick={() => saveStep(7, { purchase_limit: parseFloat(data.purchase_limit) || 0 })}
                loading={loading}
              />
            </div>
          </Card>
        )}

        {/* Step 8 — Activation */}
        {step === 8 && (
          <Card title="Всё готово!" subtitle="Проверьте данные перед активацией кабинета">
            <div className="mt-4 space-y-3">
              {[
                { label: "Компания", value: data.short_name || data.full_name },
                { label: "ИНН", value: data.inn },
                { label: "Email", value: data.email },
                { label: "Телефон", value: data.phone },
                { label: "Маркетплейс", value: { ozon: "Ozon", yandex_market: "Яндекс Маркет", both: "Ozon + ЯМ" }[data.marketplace] || data.marketplace },
                { label: "ЭДО-оператор", value: { diadoc: "Диадок", sbis: "СБИС", "1c_edo": "1С-ЭДО", other: "Другой" }[data.edo_operator] || "Не выбран" },
                { label: "Доставка", value: { ozon_partners: "Партнёры Ozon", our_service: "Наша служба" }[data.delivery_method] || "" },
                { label: "Лимит закупки", value: parseFloat(data.purchase_limit) === 0 ? "Без ограничений" : `₽ ${parseFloat(data.purchase_limit).toLocaleString("ru")}` },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-xs text-muted-foreground">{r.label}</span>
                  <span className="text-xs font-medium text-foreground">{r.value}</span>
                </div>
              ))}
            </div>
            {error && <ErrorBadge message={error} />}
            <div className="mt-6">
              <NextButton onClick={activate} loading={loading} label="Активировать кабинет" />
            </div>
            <button
              onClick={() => setStep(7)}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-3 transition-colors"
            >
              ← Изменить данные
            </button>
          </Card>
        )}

        {/* Step 9 — Success */}
        {step === 9 && (
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-6">
              <Icon name="CheckCircle" size={32} className="text-green-400" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Кабинет активирован!</h2>
            <p className="text-sm text-muted-foreground mb-8">
              Ваша компания <strong className="text-foreground">{data.short_name || data.inn}</strong> успешно подключена к платформе.
              Менеджер свяжется с вами в ближайшее время.
            </p>
            <button
              onClick={() => window.location.href = "/"}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium mx-auto"
              style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}
            >
              Перейти в кабинет
              <Icon name="ArrowRight" size={14} />
            </button>
          </div>
        )}

        {/* Back button */}
        {step > 1 && step < 9 && (
          <button
            onClick={() => { setStep(step - 1); setError(""); }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-4 mx-auto transition-colors"
          >
            <Icon name="ArrowLeft" size={12} /> Назад
          </button>
        )}
      </div>
    </div>
  );
}