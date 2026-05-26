import { useEffect, useState } from "react";
import { adminGet, adminPost } from "@/lib/adminApi";
import { Loader, ErrMsg, WarnMsg, SectionHdr, Card, PriBtn } from "./shared";
import Icon from "@/components/ui/icon";

const FIELDS: { key: string; label: string; type: string; placeholder: string; unit?: string }[] = [
  { key: "operational_day_close_time", label: "Закрытие операционного дня",  type: "text",   placeholder: "22:00",  unit: "ЧЧ:ММ" },
  { key: "invoice_due_days",           label: "Срок оплаты счёта",           type: "number", placeholder: "10",     unit: "дней" },
  { key: "markup_percent",             label: "Наценка на товар",            type: "number", placeholder: "8",      unit: "%" },
  { key: "vat_percent",                label: "НДС",                         type: "number", placeholder: "22",     unit: "%" },
  { key: "logistics_base_rate",        label: "Базовая ставка логистики",    type: "number", placeholder: "600",    unit: "₽" },
  { key: "weight_norm_kg",             label: "Норма веса",                  type: "number", placeholder: "100",    unit: "кг" },
  { key: "overweight_rate",            label: "Ставка сверх нормы",          type: "number", placeholder: "2.5",    unit: "₽/кг" },
  { key: "notification_email",         label: "Email для уведомлений",       type: "email",  placeholder: "notify@company.ru" },
];

export default function AdminSettings() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    adminGet("settings")
      .then(d => setValues(d.settings || {}))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setErr("");
    setSaved(false);
    try {
      await adminPost("settings_save", values);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  if (loading) return <Loader />;

  return (
    <div className="space-y-5 animate-fade-in max-w-2xl">
      <SectionHdr title="Настройки платформы" />
      <WarnMsg msg="Изменения настроек влияют на все расчёты платформы. Вносите изменения осторожно." />
      {err && <ErrMsg msg={err} />}

      <Card className="p-6">
        <div className="space-y-4">
          {FIELDS.map(f => (
            <div key={f.key}>
              <label className="text-xs text-muted-foreground mb-1.5 block">
                {f.label}
                {f.unit && <span className="ml-1 text-muted-foreground/60">({f.unit})</span>}
              </label>
              <input
                type={f.type}
                value={values[f.key] || ""}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-border">
          <PriBtn onClick={save} label={saving ? "Сохранение..." : "Сохранить настройки"} icon="Save" loading={saving} />
          {saved && (
            <div className="flex items-center gap-1.5 text-xs text-green-400 animate-fade-in">
              <Icon name="CheckCircle" size={13} />
              Сохранено
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
