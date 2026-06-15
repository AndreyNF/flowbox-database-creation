import { useEffect, useState, useCallback } from "react";
import { adminGet, adminPost } from "@/lib/adminApi";
import { getCurrentUser } from "@/lib/auth";
import {
  Loader, ErrMsg, WarnMsg, SectionHdr, Card, Th, Td, EmptyRow,
  Overlay, PriBtn, SecBtn, fmtDate,
} from "./shared";
import Icon from "@/components/ui/icon";

const MP_LABELS: Record<string,string> = { ozon:"Ozon", yandex_market:"Яндекс Маркет" };

interface Tariff {
  id: string; marketplace: string; category_name: string; product_type: string;
  commission_lt_1500: number; commission_1500_5000: number;
  commission_5000_10000: number; commission_gt_10000: number;
  acquiring_percent: number; service_fee_fixed: number;
  early_payout_standard: number; early_payout_ozon_bank: number;
  updated_at: string; updated_by_name: string;
  is_active: boolean;
}

const EMPTY: Omit<Tariff,"id"|"updated_at"|"updated_by_name"|"is_active"> = {
  marketplace:"ozon", category_name:"", product_type:"standard",
  commission_lt_1500:0, commission_1500_5000:0, commission_5000_10000:0, commission_gt_10000:0,
  acquiring_percent:0.019, service_fee_fixed:20,
  early_payout_standard:0.049, early_payout_ozon_bank:0.0339,
};

export default function AdminTariffs() {
  const [tariffs, setTariffs]   = useState<Tariff[]>([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");
  const [mpF, setMpF]           = useState("");
  const [activeF, setActiveF]   = useState("true");
  const [editing, setEditing]   = useState<Partial<Tariff> | null>(null);
  const [saving, setSaving]     = useState(false);
  const [confirm, setConfirm]   = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const user = getCurrentUser();

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string,string> = {};
    if (mpF) params.marketplace = mpF;
    if (activeF) params.active_only = activeF;
    adminGet("tariffs", params)
      .then(d => setTariffs(d.tariffs || []))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [mpF, activeF]);

  useEffect(() => { load(); }, [load]);

  function openEdit(t?: Tariff) {
    setEditing(t ? { ...t } : { ...EMPTY });
    setConfirm(false);
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setErr("");
    try {
      await adminPost("tariff_save", { ...editing, admin_id: user?.id });
      setEditing(null);
      setConfirm(false);
      load();
    } catch(e:unknown) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  async function toggle(t: Tariff) {
    setToggling(t.id);
    try {
      await adminPost("tariff_toggle", { id: t.id, admin_id: user?.id });
      load();
    } catch(e:unknown) { setErr((e as Error).message); }
    finally { setToggling(null); }
  }

  const pct = (v: number) => `${(Number(v) * 100).toFixed(2)}%`;
  const activeCount   = tariffs.filter(t => t.is_active).length;
  const inactiveCount = tariffs.filter(t => !t.is_active).length;

  return (
    <div className="space-y-5 animate-fade-in">
      <SectionHdr
        title="Тарифы маркетплейсов"
        sub={`${activeCount} активных · ${inactiveCount} в резерве`}
        action={<PriBtn onClick={() => openEdit()} label="Добавить категорию" icon="Plus" />}
      />
      {err && <ErrMsg msg={err} />}

      <div className="flex gap-2 flex-wrap">
        <select value={mpF} onChange={e => setMpF(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none">
          <option value="">Все маркетплейсы</option>
          <option value="ozon">Ozon</option>
          <option value="yandex_market">Яндекс Маркет</option>
        </select>
        <select value={activeF} onChange={e => setActiveF(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none">
          <option value="true">Активные</option>
          <option value="false">Резерв</option>
          <option value="">Все</option>
        </select>
      </div>

      {loading ? <Loader /> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-border">
                  <Th c="Площадка" /><Th c="Категория" /><Th c="<1500" /><Th c="1500–5К" /><Th c="5К–10К" /><Th c=">10К" /><Th c="Эквайринг" /><Th c="Сбор" /><Th c="Обновлено" /><Th c="" />
                </tr>
              </thead>
              <tbody>
                {tariffs.length === 0 && <EmptyRow cols={10} />}
                {tariffs.map(t => (
                  <tr key={t.id} className={`border-b border-border last:border-0 transition-colors ${t.is_active ? "hover:bg-secondary/30" : "opacity-50 hover:opacity-70 hover:bg-secondary/20"}`}>
                    <Td c={<span className="font-medium">{MP_LABELS[t.marketplace] || t.marketplace}</span>} />
                    <Td c={
                      <span className={t.is_active ? "text-foreground" : "text-muted-foreground line-through"}>
                        {t.category_name}
                      </span>
                    } />
                    <Td mono c={pct(t.commission_lt_1500)} />
                    <Td mono c={pct(t.commission_1500_5000)} />
                    <Td mono c={pct(t.commission_5000_10000)} />
                    <Td mono c={pct(t.commission_gt_10000)} />
                    <Td mono c={pct(t.acquiring_percent)} />
                    <Td mono c={`₽${t.service_fee_fixed}`} />
                    <Td c={
                      <div>
                        <div>{fmtDate(t.updated_at)}</div>
                        {t.updated_by_name && <div className="text-[10px] text-muted-foreground">{t.updated_by_name}</div>}
                      </div>
                    } />
                    <Td c={
                      <div className="flex gap-1.5 items-center">
                        <button onClick={() => openEdit(t)}
                          className="text-xs text-muted-foreground hover:text-foreground border border-border px-2 py-1 rounded transition-colors">
                          Ред.
                        </button>
                        <button
                          onClick={() => toggle(t)}
                          disabled={toggling === t.id}
                          title={t.is_active ? "Деактивировать (в резерв)" : "Активировать"}
                          className={`flex items-center justify-center w-7 h-7 rounded border transition-all disabled:opacity-40 ${
                            t.is_active
                              ? "border-rose-400/30 text-rose-400 hover:bg-rose-400/10"
                              : "border-green-400/30 text-green-400 hover:bg-green-400/10"
                          }`}>
                          {toggling === t.id
                            ? <Icon name="Loader2" size={11} className="animate-spin" />
                            : <Icon name={t.is_active ? "EyeOff" : "Eye"} size={11} />}
                        </button>
                      </div>
                    } />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Модалка редактирования */}
      {editing && (
        <Overlay onClose={() => setEditing(null)}>
          <div className="p-6 max-h-[80vh] overflow-y-auto">
            <div className="text-sm font-semibold text-foreground mb-4">
              {(editing as Tariff).id ? "Редактировать тариф" : "Новый тариф"}
            </div>
            <WarnMsg msg="Изменение тарифов влияет на расчёты калькулятора." />
            <div className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Маркетплейс</label>
                  <select value={editing.marketplace} onChange={e => setEditing(v => ({...v!, marketplace: e.target.value}))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none">
                    <option value="ozon">Ozon</option>
                    <option value="yandex_market">Яндекс Маркет</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Категория *</label>
                  <input value={editing.category_name || ""} onChange={e => setEditing(v => ({...v!, category_name: e.target.value}))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none" />
                </div>
              </div>
              {[
                { key:"commission_lt_1500",    label:"Комиссия < 1 500 ₽" },
                { key:"commission_1500_5000",  label:"Комиссия 1 500–5 000 ₽" },
                { key:"commission_5000_10000", label:"Комиссия 5 000–10 000 ₽" },
                { key:"commission_gt_10000",   label:"Комиссия > 10 000 ₽" },
                { key:"acquiring_percent",     label:"Эквайринг" },
                { key:"service_fee_fixed",     label:"Сервисный сбор (₽)" },
                { key:"early_payout_standard", label:"Досрочная выплата стандарт" },
                { key:"early_payout_ozon_bank",label:"Досрочная выплата Ozon-банк" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
                  <input type="number" step="0.0001"
                    value={(editing as Record<string,unknown>)[f.key] as number || 0}
                    onChange={e => setEditing(v => ({...v!, [f.key]: parseFloat(e.target.value) || 0}))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none font-mono" />
                </div>
              ))}
            </div>

            {!confirm ? (
              <div className="flex gap-2 mt-5">
                <PriBtn onClick={() => setConfirm(true)} label="Сохранить" icon="Save" disabled={!editing.category_name} />
                <SecBtn onClick={() => setEditing(null)} label="Отмена" />
              </div>
            ) : (
              <div className="mt-5 p-3 rounded-lg border border-amber-400/30 bg-amber-400/5">
                <p className="text-xs text-amber-400 mb-3">Изменение тарифов влияет на все расчёты калькулятора. Продолжить?</p>
                <div className="flex gap-2">
                  <PriBtn onClick={save} label="Да, сохранить" loading={saving} />
                  <SecBtn onClick={() => setConfirm(false)} label="Отмена" />
                </div>
              </div>
            )}
          </div>
        </Overlay>
      )}
    </div>
  );
}
