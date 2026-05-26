import { useEffect, useState } from "react";
import { adminGet, adminPost } from "@/lib/adminApi";
import {
  Loader, ErrMsg, SectionHdr, Card, Th, Td, EmptyRow,
  Overlay, PriBtn, SecBtn, fmt,
} from "./shared";
import Icon from "@/components/ui/icon";

interface Zone {
  id: string; city: string; region: string; status: string;
  min_rate: number; rate_per_kg: number; delivery_days: number;
  tc_partners: string[]; updated_at: string;
}
const EMPTY = { city:"", region:"", min_rate:0, rate_per_kg:0, delivery_days:1, tc_partners:[] as string[] };

export default function AdminZones() {
  const [zones, setZones]     = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [editing, setEditing] = useState<Partial<Zone> | null>(null);
  const [saving, setSaving]   = useState(false);
  const [warnClients, setWarnClients] = useState(0);
  const [pendingToggle, setPendingToggle] = useState<{id:string;status:string}|null>(null);

  function load() {
    setLoading(true);
    adminGet("zones")
      .then(d => setZones(d.zones || []))
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  async function saveZone() {
    if (!editing) return;
    setSaving(true);
    setErr("");
    try {
      await adminPost("zone_save", editing);
      setEditing(null);
      load();
    } catch(e:unknown) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  async function toggle(zone: Zone) {
    const newStatus = zone.status === "active" ? "inactive" : "active";
    try {
      const res = await adminPost("zone_toggle", { zone_id: zone.id, status: newStatus });
      if (newStatus === "inactive" && res.affected_clients > 0) {
        setWarnClients(res.affected_clients);
        setPendingToggle({ id: zone.id, status: newStatus });
      } else {
        load();
      }
    } catch(e:unknown) { setErr((e as Error).message); }
  }

  async function confirmToggle() {
    if (!pendingToggle) return;
    try {
      await adminPost("zone_toggle", pendingToggle);
      setPendingToggle(null);
      setWarnClients(0);
      load();
    } catch(e:unknown) { setErr((e as Error).message); }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <SectionHdr
        title="Зоны доставки"
        sub={`${zones.length} городов`}
        action={<PriBtn onClick={() => setEditing({...EMPTY})} label="Добавить город" icon="Plus" />}
      />
      {err && <ErrMsg msg={err} />}

      {loading ? <Loader /> : (
        <Card>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <Th c="Город" /><Th c="Регион" /><Th c="Статус" /><Th c="Мин. ставка" /><Th c="₽/кг" /><Th c="Дней" /><Th c="Действия" />
              </tr>
            </thead>
            <tbody>
              {zones.length === 0 && <EmptyRow cols={7} />}
              {zones.map(z => (
                <tr key={z.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                  <Td c={<span className="font-medium text-foreground">{z.city}</span>} />
                  <Td c={z.region} />
                  <Td c={
                    <span className={`text-xs font-medium ${z.status === "active" ? "text-green-400" : "text-muted-foreground"}`}>
                      {z.status === "active" ? "Активна" : "Неактивна"}
                    </span>
                  } />
                  <Td mono c={fmt(z.min_rate)} />
                  <Td mono c={`₽ ${z.rate_per_kg}`} />
                  <Td c={z.delivery_days} />
                  <Td c={
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditing({...z})}
                        className="px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-foreground transition-colors">
                        Ред.
                      </button>
                      <button
                        onClick={() => toggle(z)}
                        className={`px-2 py-1 text-[11px] rounded border transition-all ${
                          z.status === "active"
                            ? "border-rose-400/30 text-rose-400 hover:bg-rose-400/10"
                            : "border-green-400/30 text-green-400 hover:bg-green-400/10"
                        }`}>
                        {z.status === "active" ? "Деактивировать" : "Активировать"}
                      </button>
                    </div>
                  } />
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Предупреждение деактивации */}
      {warnClients > 0 && pendingToggle && (
        <Overlay onClose={() => { setPendingToggle(null); setWarnClients(0); }}>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-400/10 flex items-center justify-center">
                <Icon name="AlertTriangle" size={18} className="text-amber-400" />
              </div>
              <div className="text-sm font-semibold text-foreground">Внимание</div>
            </div>
            <p className="text-sm text-foreground mb-2">
              Деактивация затронет <strong className="text-amber-400">{warnClients}</strong> клиентов с этим городом доставки.
            </p>
            <p className="text-xs text-muted-foreground mb-5">Их заказы могут потребовать ручной обработки.</p>
            <div className="flex gap-2">
              <PriBtn onClick={confirmToggle} label="Деактивировать" />
              <SecBtn onClick={() => { setPendingToggle(null); setWarnClients(0); }} label="Отмена" />
            </div>
          </div>
        </Overlay>
      )}

      {/* Форма редактирования */}
      {editing && (
        <Overlay onClose={() => setEditing(null)}>
          <div className="p-6">
            <div className="text-sm font-semibold text-foreground mb-4">
              {(editing as Zone).id ? "Редактировать зону" : "Новая зона доставки"}
            </div>
            <div className="space-y-3">
              {[
                { key:"city",   label:"Город *", type:"text" },
                { key:"region", label:"Регион",  type:"text" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
                  <input type={f.type}
                    value={(editing as Record<string,unknown>)[f.key] as string || ""}
                    onChange={e => setEditing(v => ({...v!, [f.key]: e.target.value}))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none" />
                </div>
              ))}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key:"min_rate",     label:"Мин. ставка (₽)" },
                  { key:"rate_per_kg",  label:"Ставка ₽/кг" },
                  { key:"delivery_days",label:"Дней доставки" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
                    <input type="number"
                      value={(editing as Record<string,unknown>)[f.key] as number || 0}
                      onChange={e => setEditing(v => ({...v!, [f.key]: parseFloat(e.target.value) || 0}))}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none font-mono" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <PriBtn onClick={saveZone} label="Сохранить" icon="Save" loading={saving} disabled={!editing.city} />
              <SecBtn onClick={() => setEditing(null)} label="Отмена" />
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
