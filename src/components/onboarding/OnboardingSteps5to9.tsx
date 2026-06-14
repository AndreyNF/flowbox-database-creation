import Icon from "@/components/ui/icon";
import {
  CompanyData, Card, FieldGroup, Field, Input,
  RadioCard, NextButton, ErrorBadge,
} from "./OnboardingUI";

interface SharedProps {
  data: CompanyData;
  error: string;
  loading: boolean;
  set: (key: keyof CompanyData, val: string | boolean) => void;
  saveStep: (stepNum: number, payload: Record<string, unknown>) => void;
}

// ── STEP 5: EDO ─────────────────────────────────────────────────────────────

export function Step5EDO({ data, error, loading, set, saveStep }: SharedProps) {
  return (
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
              { value: "sbis",   title: "СБИС",            description: "Тензор" },
              { value: "1c_edo", title: "1С-ЭДО",          description: "1С" },
              { value: "other",  title: "Другой оператор", description: "Укажем при подключении" },
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
  );
}

// ── STEP 6: Delivery ─────────────────────────────────────────────────────────

export function Step6Delivery({ data, error, loading, set, saveStep }: SharedProps) {
  return (
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
  );
}

// ── STEP 7: Finance ──────────────────────────────────────────────────────────

export function Step7Finance({ data, error, loading, set, saveStep }: SharedProps) {
  return (
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
  );
}

// ── STEP 8: Activation ───────────────────────────────────────────────────────

interface Step8Props {
  data: CompanyData;
  error: string;
  loading: boolean;
  activate: () => void;
  setStep: (n: number) => void;
}

export function Step8Activation({ data, error, loading, activate, setStep }: Step8Props) {
  return (
    <Card title="Всё готово!" subtitle="Проверьте данные перед активацией кабинета">
      <div className="mt-4 space-y-3">
        {[
          { label: "Компания",      value: data.short_name || data.full_name },
          { label: "ИНН",           value: data.inn },
          { label: "Email",         value: data.email },
          { label: "Телефон",       value: data.phone },
          { label: "Маркетплейс",   value: { ozon: "Ozon", yandex_market: "Яндекс Маркет", both: "Ozon + ЯМ" }[data.marketplace] || data.marketplace },
          { label: "ЭДО-оператор",  value: { diadoc: "Диадок", sbis: "СБИС", "1c_edo": "1С-ЭДО", other: "Другой" }[data.edo_operator] || "Не выбран" },
          { label: "Доставка",      value: { ozon_partners: "Партнёры Ozon", our_service: "Наша служба" }[data.delivery_method] || "" },
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
  );
}

// ── STEP 9: Success ──────────────────────────────────────────────────────────

export function Step9Success({ companyName }: { companyName: string }) {
  return (
    <div className="text-center animate-fade-in">
      <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-6">
        <Icon name="CheckCircle" size={32} className="text-green-400" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">Кабинет активирован!</h2>
      <p className="text-sm text-muted-foreground mb-8">
        Ваша компания <strong className="text-foreground">{companyName}</strong> успешно подключена к платформе.
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
  );
}
