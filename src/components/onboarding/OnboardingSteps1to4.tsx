import Icon from "@/components/ui/icon";
import {
  CompanyData, Card, FieldGroup, Field, Input, Checkbox,
  RadioCard, NextButton, ErrorBadge,
} from "./OnboardingUI";

interface SharedProps {
  data: CompanyData;
  error: string;
  loading: boolean;
  set: (key: keyof CompanyData, val: string | boolean) => void;
  saveStep: (stepNum: number, payload: Record<string, unknown>) => void;
}

// ── STEP 1: Consents ────────────────────────────────────────────────────────

export function Step1Consents({ data, error, loading, set, saveStep }: SharedProps) {
  return (
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
  );
}

// ── STEP 2: INN ─────────────────────────────────────────────────────────────

interface Step2Props extends SharedProps {
  innLoading: boolean;
  innFound: boolean;
  lookupINN: (inn: string) => void;
  setInnFound: (v: boolean) => void;
}

export function Step2INN({ data, error, loading, set, saveStep, innLoading, innFound, lookupINN, setInnFound }: Step2Props) {
  return (
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
  );
}

// ── STEP 3: Contacts ────────────────────────────────────────────────────────

export function Step3Contacts({ data, error, loading, set, saveStep }: SharedProps) {
  return (
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
  );
}

// ── STEP 4: Marketplace ─────────────────────────────────────────────────────

interface Step4Props extends SharedProps {
  ozonValidating: boolean;
  ozonValid: boolean;
  ozonWarehouses: { id: string; name: string }[];
  validateOzon: () => void;
  setOzonValid: (v: boolean) => void;
  setOzonWarehouses: (v: { id: string; name: string }[]) => void;
  onSkip?: () => void;
}

function SkipButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-3 transition-colors py-1"
    >
      Пропустить этот шаг →
    </button>
  );
}

export function Step4Marketplace({
  data, error, loading, set, saveStep,
  ozonValidating, ozonValid, ozonWarehouses,
  validateOzon, setOzonValid, setOzonWarehouses, onSkip,
}: Step4Props) {
  const showOzon = data.marketplace === "ozon" || data.marketplace === "both";
  const showYM   = data.marketplace === "yandex_market" || data.marketplace === "both";

  return (
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
              <div className="animate-fade-in space-y-3">
                <div className="flex items-center gap-2 text-xs text-green-400">
                  <Icon name="CheckCircle" size={12} />
                  Ключ действителен · найдено {ozonWarehouses.length} склад(ов)
                </div>
                {ozonWarehouses.length > 0 ? (
                  <Field label="Склад отгрузки" required>
                    <div className="space-y-2">
                      {ozonWarehouses.map(w => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => set("ozon_warehouse_id", String(w.id))}
                          className={`w-full text-left px-4 py-3 rounded-lg border transition-all flex items-center justify-between gap-3 ${
                            data.ozon_warehouse_id === String(w.id)
                              ? "border-ring"
                              : "border-border hover:border-muted-foreground"
                          }`}
                          style={data.ozon_warehouse_id === String(w.id)
                            ? { background: "hsla(195,90%,48%,0.06)" }
                            : { background: "hsl(var(--secondary))" }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
                              style={{ background: data.ozon_warehouse_id === String(w.id)
                                ? "hsla(195,90%,48%,0.15)" : "hsl(var(--border))" }}>
                              <Icon name="Warehouse" size={13}
                                style={{ color: data.ozon_warehouse_id === String(w.id)
                                  ? "hsl(var(--cyan))" : "hsl(var(--muted-foreground))" }} />
                            </div>
                            <div className="min-w-0">
                              <div className={`text-sm font-medium truncate ${
                                data.ozon_warehouse_id === String(w.id) ? "text-foreground" : "text-muted-foreground"
                              }`}>{w.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">ID: {w.id}</div>
                            </div>
                          </div>
                          <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                            data.ozon_warehouse_id === String(w.id) ? "border-ring" : "border-border"
                          }`}>
                            {data.ozon_warehouse_id === String(w.id) && (
                              <div className="w-full h-full rounded-full scale-50"
                                style={{ background: "hsl(var(--cyan))" }} />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                    {!data.ozon_warehouse_id && (
                      <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1">
                        <Icon name="AlertTriangle" size={11} />
                        Выберите склад для продолжения
                      </p>
                    )}
                  </Field>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2.5">
                    <Icon name="AlertTriangle" size={13} />
                    Складов не найдено. Создайте склад в кабинете Ozon Seller.
                  </div>
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
            ozon_client_id: data.ozon_client_id,
            ozon_api_key: data.ozon_api_key,
            ozon_warehouse_id: data.ozon_warehouse_id,
            ym_api_key: data.ym_api_key,
            ym_warehouse_id: data.ym_warehouse_id,
          })}
          disabled={
            !data.marketplace ||
            (showOzon && (!data.ozon_client_id || !data.ozon_api_key || !ozonValid || !data.ozon_warehouse_id)) ||
            (showYM && !data.ym_api_key)
          }
          loading={loading}
        />
        {onSkip && <SkipButton onClick={onSkip} />}
      </div>
    </Card>
  );
}