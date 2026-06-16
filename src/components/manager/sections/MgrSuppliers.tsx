import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { mgrGet, mgrPost } from "@/lib/managerApi";
import { Loader, ErrMsg, SectionHdr, Card, Th, Td, EmptyRow, PriBtn, fmtDate, Input, FieldLabel } from "../shared";
import Icon from "@/components/ui/icon";

const API_DADATA = "https://functions.poehali.dev/0a0add78-6b3a-48c1-8984-0e1180e72ad3";

interface SupplierForm {
  id?: string; name: string; short_name: string; inn: string; kpp: string; ogrn: string;
  legal_address: string; vat_payer: boolean; contact_person: string;
  email: string; phone: string; warehouse_address: string; pickup_hours: string; working_days: string;
}

const EMPTY: SupplierForm = { name:"",short_name:"",inn:"",kpp:"",ogrn:"",legal_address:"",vat_payer:true,contact_person:"",email:"",phone:"",warehouse_address:"",pickup_hours:"",working_days:"" };

export default function MgrSuppliers() {
  const [suppliers, setSuppliers] = useState<Record<string,unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [modal, setModal] = useState<SupplierForm|null>(null);
  const [saving, setSaving] = useState(false);
  const [innLoading, setInnLoading] = useState(false);

  function load() {
    setLoading(true);
    mgrGet("suppliers").then(d=>setSuppliers(d.suppliers||[])).catch((e:Error)=>setErr(e.message)).finally(()=>setLoading(false));
  }
  useEffect(()=>{ load(); }, []);

  async function lookupINN(inn: string) {
    if (!modal || inn.length < 10) return;
    setInnLoading(true);
    try {
      const res = await fetch(`${API_DADATA}?inn=${inn}`);
      const d = JSON.parse(await res.text());
      if (!res.ok) throw new Error(d.error);
      if (d.status === "LIQUIDATED") { setErr("Компания ликвидирована"); return; }
      setModal(m => m ? { ...m, name:d.full_name||m.name, short_name:d.short_name||m.short_name, kpp:d.kpp||"", ogrn:d.ogrn||"", legal_address:d.legal_address||"", vat_payer:true } : m);
    } catch(e:Error){ setErr((e as Error).message); }
    finally { setInnLoading(false); }
  }

  async function save() {
    if (!modal) return;
    if (!modal.name || !modal.inn) { setErr("Название и ИНН обязательны"); return; }
    setSaving(true);
    try { await mgrPost("supplier_save", modal); setModal(null); load(); }
    catch(e:Error){ setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <SectionHdr title="Поставщики" sub={`${suppliers.length} поставщиков`}
        action={<PriBtn onClick={()=>setModal({...EMPTY})} label="Добавить поставщика" icon="Plus" />} />
      {err && <div className="text-xs text-rose-400 bg-rose-400/10 rounded-lg px-3 py-2">{err}</div>}
      {loading ? <Loader /> : (
        <Card>
          <table className="w-full">
            <thead><tr className="border-b border-border"><Th c="Название" /><Th c="ИНН" /><Th c="Статус" /><Th c="Товаров" /><Th c="Контакт" /><Th c="Дата" /><Th c="" /></tr></thead>
            <tbody>
              {suppliers.length===0 && <EmptyRow cols={7} />}
              {suppliers.map(s => (
                <tr key={s.id as string} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                  <Td c={<div><div className="text-xs font-medium text-foreground">{s.name as string}</div><div className="text-[10px] text-muted-foreground">{(s.short_name as string)||""}</div></div>} />
                  <Td c={s.inn as string} mono />
                  <Td c={<span className={`text-xs font-medium ${s.status==="active"?"text-green-400":"text-muted-foreground"}`}>{s.status==="active"?"Активен":"Неактивен"}</span>} />
                  <Td c={String(s.products_count||0)} mono />
                  <Td c={<div><div className="text-xs text-foreground">{s.email as string}</div><div className="text-[10px] text-muted-foreground">{s.phone as string}</div></div>} />
                  <Td c={fmtDate(s.created_at as string)} />
                  <Td c={
                    <button onClick={()=>setModal({...EMPTY,...(s as unknown as SupplierForm),id:s.id as string})}
                      className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">
                      Изменить
                    </button>
                  } />
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {modal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 overflow-y-auto py-8" onClick={()=>setModal(null)}>
          <div className="rounded-xl border border-border p-6 w-full max-w-2xl animate-fade-in mx-4" style={{background:"hsl(var(--card))"}} onClick={e=>e.stopPropagation()}>
            <div className="text-sm font-semibold text-foreground mb-5">{modal.id?"Редактировать поставщика":"Добавить поставщика"}</div>

            <div className="grid grid-cols-2 gap-4">
              <FieldLabel label="ИНН *">
                <div className="relative">
                  <Input value={modal.inn} onChange={v=>{ setModal(m=>m?{...m,inn:v}:m); if(v.length===10||v.length===12) lookupINN(v); }} placeholder="10 или 12 цифр" />
                  {innLoading && <Icon name="Loader2" size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
                </div>
              </FieldLabel>
              <FieldLabel label="Полное название *">
                <Input value={modal.name} onChange={v=>setModal(m=>m?{...m,name:v}:m)} />
              </FieldLabel>
              <FieldLabel label="Краткое название">
                <Input value={modal.short_name} onChange={v=>setModal(m=>m?{...m,short_name:v}:m)} />
              </FieldLabel>
              <FieldLabel label="КПП">
                <Input value={modal.kpp} onChange={v=>setModal(m=>m?{...m,kpp:v}:m)} />
              </FieldLabel>
              <FieldLabel label="ОГРН">
                <Input value={modal.ogrn} onChange={v=>setModal(m=>m?{...m,ogrn:v}:m)} />
              </FieldLabel>
              <FieldLabel label="Юридический адрес">
                <Input value={modal.legal_address} onChange={v=>setModal(m=>m?{...m,legal_address:v}:m)} />
              </FieldLabel>
              <FieldLabel label="Контактное лицо">
                <Input value={modal.contact_person} onChange={v=>setModal(m=>m?{...m,contact_person:v}:m)} />
              </FieldLabel>
              <FieldLabel label="Email">
                <Input value={modal.email} onChange={v=>setModal(m=>m?{...m,email:v}:m)} type="email" />
              </FieldLabel>
              <FieldLabel label="Телефон">
                <Input value={modal.phone} onChange={v=>setModal(m=>m?{...m,phone:v}:m)} />
              </FieldLabel>
              <FieldLabel label="Адрес склада">
                <Input value={modal.warehouse_address} onChange={v=>setModal(m=>m?{...m,warehouse_address:v}:m)} />
              </FieldLabel>
              <FieldLabel label="Часы забора">
                <Input value={modal.pickup_hours} onChange={v=>setModal(m=>m?{...m,pickup_hours:v}:m)} placeholder="09:00–18:00" />
              </FieldLabel>
              <FieldLabel label="Рабочие дни">
                <Input value={modal.working_days} onChange={v=>setModal(m=>m?{...m,working_days:v}:m)} placeholder="пн-пт" />
              </FieldLabel>
            </div>

            <label className="flex items-center gap-2 mt-4 cursor-pointer">
              <div onClick={()=>setModal(m=>m?{...m,vat_payer:!m.vat_payer}:m)}
                className={`w-8 h-4 rounded-full relative transition-all ${modal.vat_payer?"":"bg-secondary border border-border"}`}
                style={modal.vat_payer?{background:"hsl(var(--cyan))"}:{}}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${modal.vat_payer?"left-4":"left-0.5"}`} />
              </div>
              <span className="text-xs text-muted-foreground">Плательщик НДС</span>
              {!modal.vat_payer && <span className="text-xs text-rose-400">⚠ Не плательщик НДС — подключение невозможно</span>}
            </label>

            <div className="flex gap-2 mt-5">
              <button onClick={save} disabled={saving||!modal.vat_payer||!modal.name}
                className="flex-1 py-2 text-xs rounded-lg font-medium disabled:opacity-40"
                style={{background:"hsl(var(--cyan))",color:"hsl(var(--primary-foreground))"}}>
                {saving?"Сохранение...":"Сохранить"}
              </button>
              <button onClick={()=>setModal(null)} className="flex-1 py-2 text-xs rounded-lg border border-border text-muted-foreground">Отмена</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}