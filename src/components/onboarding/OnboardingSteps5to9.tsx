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

// ── STEP 5: EDO ─────────────────────────────────────────────────────────────

export function Step5EDO({ data, error, loading, set, saveStep, onSkip }: SharedProps) {
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
          disabled={!data.edo_operator}
          loading={loading}
        />
        {onSkip && <SkipButton onClick={onSkip} />}
      </div>
    </Card>
  );
}

// ── STEP 6: Delivery ─────────────────────────────────────────────────────────

export function Step6Delivery({ data, error, loading, set, saveStep, onSkip }: SharedProps) {
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
        {onSkip && <SkipButton onClick={onSkip} />}
      </div>
    </Card>
  );
}

// ── STEP 7: Finance ──────────────────────────────────────────────────────────

export function Step7Finance({ data, error, loading, set, saveStep, onSkip }: SharedProps) {
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
        {onSkip && <SkipButton onClick={onSkip} />}
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
  skipped: Set<number>;
}

const STEP_LABELS: Record<number, { label: string; desc: string; critical: boolean }> = {
  4: { label: "Маркетплейс", desc: "API-ключ Ozon не подключён — размещение заказов невозможно", critical: true },
  5: { label: "ЭДО",         desc: "Оператор ЭДО не выбран — потребуется до 01.09.2026",        critical: false },
  6: { label: "Доставка",    desc: "Способ доставки не указан",                                  critical: false },
  7: { label: "Финансы",     desc: "Лимит закупки не установлен (будет без ограничений)",        critical: false },
};

export function Step8Activation({ data, error, loading, activate, setStep, skipped }: Step8Props) {
  const skippedList = [...skipped].filter(n => STEP_LABELS[n]);
  const hasBlocker = skipped.has(4); // маркетплейс — критичный

  return (
    <Card title="Всё готово!" subtitle="Проверьте данные перед активацией кабинета">

      {/* Предупреждения о пропущенных шагах */}
      {skippedList.length > 0 && (
        <div className="mt-4 space-y-2">
          {skippedList.map(n => {
            const info = STEP_LABELS[n];
            return (
              <div
                key={n}
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${
                  info.critical
                    ? "border-rose-400/30 bg-rose-400/5"
                    : "border-amber-400/30 bg-amber-400/5"
                }`}
              >
                <Icon
                  name={info.critical ? "XCircle" : "AlertTriangle"}
                  size={14}
                  className={`flex-shrink-0 mt-0.5 ${info.critical ? "text-rose-400" : "text-amber-400"}`}
                />
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-medium ${info.critical ? "text-rose-400" : "text-amber-400"}`}>
                    {info.label} не заполнен
                  </span>
                  <p className={`text-xs mt-0.5 ${info.critical ? "text-rose-300" : "text-amber-300/80"}`}>
                    {info.desc}
                  </p>
                </div>
                <button
                  onClick={() => setStep(n)}
                  className={`text-xs px-2 py-1 rounded flex-shrink-0 font-medium transition-colors ${
                    info.critical
                      ? "bg-rose-400/15 text-rose-400 hover:bg-rose-400/25"
                      : "bg-amber-400/15 text-amber-400 hover:bg-amber-400/25"
                  }`}
                >
                  Заполнить
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Сводка данных */}
      <div className="mt-4 space-y-3">
        {[
          { label: "Компания",      value: data.short_name || data.full_name },
          { label: "ИНН",           value: data.inn },
          { label: "Email",         value: data.email },
          { label: "Телефон",       value: data.phone },
          { label: "Маркетплейс",   value: skipped.has(4) ? "—" : ({ ozon: "Ozon", yandex_market: "Яндекс Маркет", both: "Ozon + ЯМ" }[data.marketplace] || data.marketplace) },
          { label: "ЭДО-оператор",  value: skipped.has(5) ? "—" : ({ diadoc: "Диадок", sbis: "СБИС", "1c_edo": "1С-ЭДО", other: "Другой" }[data.edo_operator] || "Не выбран") },
          { label: "Доставка",      value: skipped.has(6) ? "—" : ({ ozon_partners: "Партнёры Ozon", our_service: "Наша служба" }[data.delivery_method] || "Не указана") },
          { label: "Лимит закупки", value: skipped.has(7) ? "—" : (parseFloat(data.purchase_limit) === 0 ? "Без ограничений" : `₽ ${parseFloat(data.purchase_limit).toLocaleString("ru")}`) },
        ].map(r => (
          <div key={r.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <span className="text-xs text-muted-foreground">{r.label}</span>
            <span className={`text-xs font-medium ${r.value === "—" ? "text-muted-foreground" : "text-foreground"}`}>{r.value}</span>
          </div>
        ))}
      </div>

      {error && <ErrorBadge message={error} />}

      {hasBlocker ? (
        <div className="mt-6 space-y-2">
          <button
            disabled
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium opacity-40 cursor-not-allowed"
            style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}
          >
            Активировать кабинет
          </button>
          <p className="text-center text-xs text-rose-400">
            Заполните маркетплейс — без него работа невозможна
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <NextButton onClick={activate} loading={loading} label="Активировать кабинет" />
          {skippedList.length > 0 && (
            <p className="text-center text-xs text-muted-foreground mt-2">
              Незаполненные данные можно добавить в настройках кабинета
            </p>
          )}
        </div>
      )}

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
