import { useEffect, useState, useCallback } from "react";
import { mgrGet, mgrPost } from "@/lib/managerApi";
import { Loader, ErrMsg, SectionHdr, Card, Th, Td, EmptyRow, Badge, CLAIM_STATUS, CLAIM_TYPE, fmt, fmtDate, Select } from "../shared";
import Icon from "@/components/ui/icon";

const COMP_TYPES = ["money","part_replacement","back_to_stock","write_off","return_to_supplier"];
const COMP_LABELS: Record<string,string> = { money:"Денежная", part_replacement:"Замена детали", back_to_stock:"Возврат на склад", write_off:"Списание", return_to_supplier:"Возврат поставщику" };

interface Props { initialClaimId?: string; }

export default function MgrClaims({ initialClaimId }: Props) {
  const [claims, setClaims] = useState<Record<string,unknown>[]>([]);
  const [companies, setCompanies] = useState<{id:string;name:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [stFilter, setStFilter] = useState("");
  const [cFilter, setCFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [detail, setDetail] = useState<Record<string,unknown>|null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decision, setDecision] = useState("");
  const [compAmount, setCompAmount] = useState("0");
  const [compType, setCompType] = useState("money");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const extra: Record<string,string> = {};
    if (stFilter) extra.status = stFilter;
    if (cFilter) extra.company_id = cFilter;
    if (typeFilter) extra.type = typeFilter;
    mgrGet("claims", extra)
      .then(d => { setClaims(d.claims||[]); setCompanies(d.companies||[]); })
      .catch((e:Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [stFilter, cFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (initialClaimId) loadDetail(initialClaimId); }, [initialClaimId]);

  async function loadDetail(id: string) {
    setDetailLoading(true);
    try { const d = await mgrGet("claim_detail", { claim_id:id }); setDetail(d.claim); setDecision(d.claim.decision||""); setCompAmount(String(d.claim.compensation_amount||0)); }
    catch(e:Error){ setErr((e as Error).message); }
    finally { setDetailLoading(false); }
  }

  async function sendDecision() {
    if (!detail) return;
    setSaving(true);
    try {
      await mgrPost("claim_update", { action:"send_decision", claim_id:detail.id, decision, compensation_amount:parseFloat(compAmount)||0, compensation_type:compType });
      loadDetail(detail.id as string); load();
    } catch(e:Error){ setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  async function doAction(action: string) {
    if (!detail) return;
    await mgrPost("claim_update", { action, claim_id: detail.id });
    loadDetail(detail.id as string); load();
  }

  if (detail) {
    const history = (detail.history as {date:string;status:string;comment:string}[]) || [];
    const photos = (detail.photos as string[]) || [];
    const canSend = !["closed","agreed"].includes(detail.status as string);

    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetail(null)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Icon name="ArrowLeft" size={13} /> К списку
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium text-foreground">{detail.claim_number as string}</span>
          <Badge map={CLAIM_STATUS} k={detail.status as string} />
        </div>
        {detailLoading ? <Loader /> : (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-4">
              <Card className="p-5">
                <div className="text-sm font-medium text-foreground mb-4">Данные рекламации</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
                  {[["Клиент",detail.company_name],["Заказ",detail.order_number],["Товар",detail.product_name],
                    ["Тип",CLAIM_TYPE[detail.type as string]||detail.type],["Источник",detail.source]].map(([l,v])=>(
                    <div key={l as string} className="flex gap-2">
                      <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{l as string}:</span>
                      <span className="text-xs text-foreground">{(v as string)||"—"}</span>
                    </div>
                  ))}
                </div>
                {detail.description && <p className="text-xs text-foreground bg-secondary rounded-lg p-3 leading-relaxed">{detail.description as string}</p>}
              </Card>

              {photos.length > 0 && (
                <Card className="p-5">
                  <div className="text-sm font-medium text-foreground mb-3">Фотоматериалы</div>
                  <div className="grid grid-cols-4 gap-2">
                    {photos.map((u,i) => (
                      <a key={i} href={u} target="_blank" rel="noreferrer">
                        <img src={u} alt="" className="w-full h-20 object-cover rounded-lg border border-border hover:opacity-80 transition-opacity" />
                      </a>
                    ))}
                  </div>
                </Card>
              )}

              {canSend && (
                <Card className="p-5">
                  <div className="text-sm font-medium text-foreground mb-4">Решение менеджера</div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Текст решения *</label>
                      <textarea value={decision} onChange={e => setDecision(e.target.value)} rows={4}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none resize-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Сумма компенсации (₽)</label>
                        <input type="number" value={compAmount} onChange={e => setCompAmount(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none font-mono" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Тип компенсации</label>
                        <select value={compType} onChange={e => setCompType(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-muted-foreground focus:outline-none">
                          {COMP_TYPES.map(t => <option key={t} value={t}>{COMP_LABELS[t]}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={sendDecision} disabled={!decision.trim()||saving}
                        className="flex items-center gap-2 px-4 py-2 text-xs rounded-lg font-medium disabled:opacity-40"
                        style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
                        {saving ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="Send" size={13} />}
                        Отправить решение клиенту
                      </button>
                      {detail.status === "disputed" && (
                        <button onClick={() => doAction("procedural")}
                          className="px-4 py-2 text-xs rounded-lg border border-violet-400/30 text-violet-400 hover:bg-violet-400/10 font-medium">
                          Процессуальная
                        </button>
                      )}
                      <button onClick={() => doAction("close")}
                        className="px-4 py-2 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground">
                        Закрыть
                      </button>
                    </div>
                  </div>
                </Card>
              )}
            </div>

            <div className="space-y-4">
              <Card className="p-5">
                <div className="text-sm font-medium text-foreground mb-4">История</div>
                {history.length === 0 ? <p className="text-xs text-muted-foreground">Нет записей</p> : (
                  <div className="space-y-3">
                    {history.map((h,i) => (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-2 h-2 rounded-full mt-1 flex-shrink-0" style={{ background: "hsl(var(--cyan))" }} />
                          {i < history.length-1 && <div className="w-0.5 flex-1 mt-1" style={{ background: "hsl(var(--border))" }} />}
                        </div>
                        <div className="pb-3">
                          <div className="text-[10px] text-muted-foreground">{fmtDate(h.date)}</div>
                          <div className="text-xs font-medium text-foreground mt-0.5">{CLAIM_STATUS[h.status]?.l||h.status}</div>
                          {h.comment && <p className="text-[10px] text-muted-foreground mt-0.5">{h.comment}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              {detail.compensation_amount && Number(detail.compensation_amount) > 0 && (
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Компенсация</div>
                  <div className="font-mono text-lg font-semibold text-foreground">{fmt(detail.compensation_amount as number)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{COMP_LABELS[detail.compensation_type as string]||""}</div>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <SectionHdr title="Рекламации" sub={`${claims.length} обращений`} />
      <div className="flex gap-3 flex-wrap">
        <Select value={stFilter} onChange={v=>{setStFilter(v);}} options={[{value:"",label:"Все статусы"},...Object.entries(CLAIM_STATUS).map(([k,v])=>({value:k,label:v.l}))]} />
        <Select value={cFilter} onChange={setCFilter} options={[{value:"",label:"Все клиенты"},...companies.map(c=>({value:c.id,label:c.name}))]} className="min-w-40" />
        <Select value={typeFilter} onChange={setTypeFilter} options={[{value:"",label:"Все типы"},...Object.entries(CLAIM_TYPE).map(([k,v])=>({value:k,label:v}))]} />
      </div>
      {err && <ErrMsg msg={err} />}
      {loading ? <Loader /> : (
        <Card>
          <table className="w-full">
            <thead><tr className="border-b border-border"><Th c="Номер" /><Th c="Клиент" /><Th c="Заказ" /><Th c="Тип" /><Th c="Статус" /><Th c="Компенсация" /><Th c="Дата" /></tr></thead>
            <tbody>
              {claims.length === 0 && <EmptyRow cols={7} />}
              {claims.map(c => (
                <tr key={c.id as string} onClick={() => loadDetail(c.id as string)}
                  className="border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer transition-colors">
                  <Td c={c.claim_number as string} mono />
                  <Td c={c.company_name as string} />
                  <Td c={<span className="font-mono">{(c.order_number as string)||"—"}</span>} />
                  <Td c={CLAIM_TYPE[c.type as string]||c.type as string} />
                  <Td c={<Badge map={CLAIM_STATUS} k={c.status as string} />} />
                  <Td c={Number(c.compensation_amount)>0?fmt(c.compensation_amount as number):"—"} mono />
                  <Td c={fmtDate(c.created_at as string)} />
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
