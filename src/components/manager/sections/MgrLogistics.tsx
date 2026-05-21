import { useEffect, useState } from "react";
import { mgrGet, mgrPost } from "@/lib/managerApi";
import { Loader, ErrMsg, SectionHdr, Card, Th, Td, EmptyRow, PriBtn, fmt, Input, FieldLabel } from "../shared";
import Icon from "@/components/ui/icon";

interface Zone { id?:string; city:string; region:string; status:string; min_rate:string; rate_per_kg:string; delivery_days:string; tc_partners:string; }
const EMPTY_ZONE: Zone = { city:"",region:"",status:"active",min_rate:"0",rate_per_kg:"0",delivery_days:"1",tc_partners:"" };

export default function MgrLogistics() {
  const [data, setData] = useState<Record<string,unknown>|null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [zoneModal, setZoneModal] = useState<Zone|null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    mgrGet("logistics").then(setData).catch((e:Error)=>setErr(e.message)).finally(()=>setLoading(false));
  }
  useEffect(()=>{ load(); },[]);

  async function saveZone() {
    if (!zoneModal) return;
    setSaving(true);
    try {
      const payload: Record<string,unknown> = {
        city:zoneModal.city, region:zoneModal.region, status:zoneModal.status,
        min_rate:parseFloat(zoneModal.min_rate)||0, rate_per_kg:parseFloat(zoneModal.rate_per_kg)||0,
        delivery_days:parseInt(zoneModal.delivery_days)||1,
        tc_partners:zoneModal.tc_partners?zoneModal.tc_partners.split(",").map(s=>s.trim()):[]
      };
      if (zoneModal.id) payload.id = zoneModal.id;
      await mgrPost("zone_save", payload);
      setZoneModal(null); load();
    } catch(e:Error){ setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  const zones = (data?.zones as Record<string,unknown>[]) || [];
  const tasks = (data?.tasks_today as Record<string,unknown>[]) || [];

  return (
    <div className="space-y-5 animate-fade-in">
      <SectionHdr title="Логистика" sub="Задания на сегодня и зоны доставки" />
      {err && <div className="text-xs text-rose-400 bg-rose-400/10 rounded-lg px-3 py-2">{err}</div>}
      {loading ? <Loader /> : (
        <>
          {/* Tasks */}
          <Card>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <span className="text-sm font-medium text-foreground">Задания на сегодня</span>
              <span className="text-xs text-muted-foreground">{tasks.length} заданий</span>
            </div>
            <table className="w-full">
              <thead><tr className="border-b border-border"><Th c="Тип" /><Th c="Поставщик" /><Th c="Логист" /><Th c="Коробок" /><Th c="Трекинг" /><Th c="Статус" /></tr></thead>
              <tbody>
                {tasks.length===0 && <EmptyRow cols={6} text="Заданий нет" />}
                {tasks.map(t => (
                  <tr key={t.id as string} className="border-b border-border last:border-0">
                    <Td c={t.type as string} />
                    <Td c={t.supplier_name as string} />
                    <Td c={(t.logist_name as string)||"—"} />
                    <Td c={String(t.total_boxes||0)} mono />
                    <Td c={<span className="font-mono">{(t.tracking_number as string)||"—"}</span>} />
                    <Td c={<span className={`text-xs font-medium ${t.status==="delivered"?"text-green-400":t.status==="in_transit"?"text-amber-400":"text-muted-foreground"}`}>{t.status as string}</span>} />
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Zones */}
          <Card>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <span className="text-sm font-medium text-foreground">Зоны доставки</span>
              <PriBtn onClick={()=>setZoneModal({...EMPTY_ZONE})} label="Добавить город" icon="Plus" />
            </div>
            <table className="w-full">
              <thead><tr className="border-b border-border"><Th c="Город" /><Th c="Регион" /><Th c="Статус" /><Th c="Мин. тариф" /><Th c="За кг" /><Th c="Срок (дней)" /><Th c="" /></tr></thead>
              <tbody>
                {zones.length===0 && <EmptyRow cols={7} text="Зон нет" />}
                {zones.map(z => (
                  <tr key={z.id as string} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                    <Td c={<span className="font-medium">{z.city as string}</span>} />
                    <Td c={z.region as string} />
                    <Td c={<span className={`text-xs font-medium ${z.status==="active"?"text-green-400":"text-muted-foreground"}`}>{z.status==="active"?"Активна":"Отключена"}</span>} />
                    <Td c={fmt(z.min_rate as number)} mono />
                    <Td c={fmt(z.rate_per_kg as number)} mono />
                    <Td c={String(z.delivery_days||1)} mono />
                    <Td c={
                      <button onClick={()=>setZoneModal({ id:z.id as string, city:z.city as string, region:z.region as string, status:z.status as string, min_rate:String(z.min_rate||0), rate_per_kg:String(z.rate_per_kg||0), delivery_days:String(z.delivery_days||1), tc_partners:Array.isArray(z.tc_partners)?(z.tc_partners as string[]).join(", "):"" })}
                        className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">
                        Изменить
                      </button>
                    } />
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {zoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={()=>setZoneModal(null)}>
          <div className="rounded-xl border border-border p-6 w-full max-w-lg animate-fade-in" style={{background:"hsl(var(--card))"}} onClick={e=>e.stopPropagation()}>
            <div className="text-sm font-semibold text-foreground mb-4">{zoneModal.id?"Редактировать зону":"Новая зона доставки"}</div>
            <div className="grid grid-cols-2 gap-3">
              <FieldLabel label="Город *"><Input value={zoneModal.city} onChange={v=>setZoneModal(z=>z?{...z,city:v}:z)} /></FieldLabel>
              <FieldLabel label="Регион *"><Input value={zoneModal.region} onChange={v=>setZoneModal(z=>z?{...z,region:v}:z)} /></FieldLabel>
              <FieldLabel label="Мин. тариф (₽)"><Input value={zoneModal.min_rate} onChange={v=>setZoneModal(z=>z?{...z,min_rate:v}:z)} type="number" /></FieldLabel>
              <FieldLabel label="За кг (₽)"><Input value={zoneModal.rate_per_kg} onChange={v=>setZoneModal(z=>z?{...z,rate_per_kg:v}:z)} type="number" /></FieldLabel>
              <FieldLabel label="Срок доставки (дней)"><Input value={zoneModal.delivery_days} onChange={v=>setZoneModal(z=>z?{...z,delivery_days:v}:z)} type="number" /></FieldLabel>
              <FieldLabel label="Партнёры ТК (через запятую)"><Input value={zoneModal.tc_partners} onChange={v=>setZoneModal(z=>z?{...z,tc_partners:v}:z)} placeholder="СДЭК, Boxberry" /></FieldLabel>
            </div>
            <FieldLabel label="Статус">
              <div className="flex gap-2 mt-1">
                {["active","inactive"].map(st => (
                  <button key={st} onClick={()=>setZoneModal(z=>z?{...z,status:st}:z)}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-all font-medium ${zoneModal.status===st?"border-ring text-foreground":"border-border text-muted-foreground hover:text-foreground"}`}
                    style={zoneModal.status===st?{background:"hsla(195,90%,48%,0.08)"}:{}}>
                    {st==="active"?"Активна":"Отключена"}
                  </button>
                ))}
              </div>
            </FieldLabel>
            <div className="flex gap-2 mt-4">
              <button onClick={saveZone} disabled={saving||!zoneModal.city}
                className="flex-1 py-2 text-xs rounded-lg font-medium disabled:opacity-40"
                style={{background:"hsl(var(--cyan))",color:"hsl(var(--primary-foreground))"}}>
                {saving?"Сохранение...":"Сохранить"}
              </button>
              <button onClick={()=>setZoneModal(null)} className="flex-1 py-2 text-xs rounded-lg border border-border text-muted-foreground">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
