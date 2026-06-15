import { useEffect, useState, useCallback } from "react";
import { mgrGet, mgrPost } from "@/lib/managerApi";
import { Loader, ErrMsg, SectionHdr, Card, Th, Td, EmptyRow, Badge, ORDER_STATUS, fmt, fmtDate, Select } from "../shared";
import Icon from "@/components/ui/icon";

const INVOICE_URL = "https://functions.poehali.dev/6ab4a2f0-8620-448a-9f2d-12fc4b582914";

interface PreviewItem {
  company_id: string;
  company_name: string;
  invoice_number: string;
  total_vat: number;
  orders_count: number;
}

type DayStep = "idle" | "previewing" | "preview" | "running" | "done";

export default function MgrOrders() {
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [companies, setCompanies] = useState<{id:string;name:string}[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [cFilter, setCFilter] = useState("");
  const [stFilter, setStFilter] = useState("");
  const [payFilter, setPayFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [cancelModal, setCancelModal] = useState<string|null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const LIMIT = 20;

  // Закрытие дня
  const [dayStep, setDayStep] = useState<DayStep>("idle");
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [dayResult, setDayResult] = useState<{ invoices_created: number } | null>(null);
  const [dayErr, setDayErr] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const extra: Record<string,string> = { limit: String(LIMIT), offset: String(offset) };
    if (cFilter) extra.company_id = cFilter;
    if (stFilter) extra.status = stFilter;
    if (payFilter) extra.payment_status = payFilter;
    if (dateFrom) extra.date_from = dateFrom;
    if (dateTo) extra.date_to = dateTo;
    mgrGet("orders", extra)
      .then(d => { setOrders(d.orders||[]); setTotal(d.total||0); setCompanies(d.companies||[]); })
      .catch((e:Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [cFilter, stFilter, payFilter, dateFrom, dateTo, offset]);

  useEffect(() => { load(); }, [load]);

  async function confirm(id: string) {
    setActionLoading(true);
    try { await mgrPost("order_action", { action:"confirm", order_id:id }); load(); }
    catch(e:unknown){ setErr((e as Error).message); }
    finally { setActionLoading(false); }
  }
  async function cancel() {
    if (!cancelModal) return;
    setActionLoading(true);
    try { await mgrPost("order_action", { action:"cancel", order_id:cancelModal, reason:cancelReason }); setCancelModal(null); setCancelReason(""); load(); }
    catch(e:unknown){ setErr((e as Error).message); }
    finally { setActionLoading(false); }
  }

  async function openDayPreview() {
    setDayStep("previewing"); setDayErr("");
    try {
      const res = await fetch(`${INVOICE_URL}?action=preview`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Ошибка превью");
      setPreviewItems(d.results || []);
      setDayStep("preview");
    } catch(e: unknown) {
      setDayErr((e as Error).message);
      setDayStep("idle");
    }
  }

  async function runCloseDay() {
    setDayStep("running"); setDayErr("");
    try {
      const res = await fetch(INVOICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Ошибка при закрытии дня");
      setDayResult({ invoices_created: d.invoices_created });
      setDayStep("done");
      load();
    } catch(e: unknown) {
      setDayErr((e as Error).message);
      setDayStep("preview");
    }
  }

  function closeDayModal() {
    setDayStep("idle");
    setPreviewItems([]);
    setDayResult(null);
    setDayErr("");
  }

  const pages = Math.ceil(total/LIMIT);
  const page = Math.floor(offset/LIMIT);

  const previewTotal = previewItems.reduce((s, i) => s + i.total_vat, 0);
  const previewInvoices = previewItems.length;

  return (
    <div className="space-y-4 animate-fade-in">
      <SectionHdr title="Заказы" sub={`Всего: ${total}`}
        action={
          <button
            onClick={openDayPreview}
            disabled={dayStep === "previewing"}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 font-medium transition-all disabled:opacity-40">
            {dayStep === "previewing"
              ? <Icon name="Loader2" size={13} className="animate-spin" />
              : <Icon name="Sunset" size={13} />}
            Закрыть день
          </button>
        } />

      <div className="flex flex-wrap gap-3">
        <Select value={cFilter} onChange={v => { setCFilter(v); setOffset(0); }}
          options={[{value:"",label:"Все клиенты"},...companies.map(c=>({value:c.id,label:c.name}))]} className="min-w-40" />
        <Select value={stFilter} onChange={v => { setStFilter(v); setOffset(0); }}
          options={[{value:"",label:"Все статусы"},...Object.entries(ORDER_STATUS).map(([k,v])=>({value:k,label:v.l}))]} />
        <Select value={payFilter} onChange={v => { setPayFilter(v); setOffset(0); }}
          options={[{value:"",label:"Оплата: все"},{value:"unpaid",label:"Не оплачен"},{value:"paid",label:"Оплачен"}]} />
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setOffset(0); }}
          className="text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-muted-foreground focus:outline-none" />
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setOffset(0); }}
          className="text-xs px-3 py-2 rounded-lg border border-border bg-secondary text-muted-foreground focus:outline-none" />
      </div>

      {err && <ErrMsg msg={err} />}
      {loading ? <Loader /> : (
        <>
          <Card>
            <table className="w-full">
              <thead><tr className="border-b border-border">
                <Th c="Номер" /><Th c="Клиент" /><Th c="Товар" /><Th c="Кол-во" /><Th c="Сумма" /><Th c="Оплата" /><Th c="Статус" /><Th c="Дата" /><Th c="" />
              </tr></thead>
              <tbody>
                {orders.length === 0 && <EmptyRow cols={9} />}
                {orders.map(o => (
                  <tr key={o.id as string} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                    <Td c={o.order_number as string} mono />
                    <Td c={<span className="text-foreground font-medium">{o.company_name as string}</span>} />
                    <Td c={<span className="text-muted-foreground">{(o.product_name as string)||"—"}</span>} />
                    <Td c={o.quantity as number} mono />
                    <Td c={fmt(o.total_amount as number)} mono />
                    <Td c={<span className={`text-xs font-medium ${o.payment_status==="paid"?"text-green-400":"text-amber-400"}`}>{o.payment_status==="paid"?"Оплачен":"Не оплачен"}</span>} />
                    <Td c={<Badge map={ORDER_STATUS} k={o.order_status as string} />} />
                    <Td c={fmtDate(o.created_at as string)} />
                    <Td c={
                      <div className="flex gap-1">
                        {o.order_status === "new" && (
                          <button onClick={() => confirm(o.id as string)} disabled={actionLoading}
                            className="text-xs px-2 py-1 rounded font-medium disabled:opacity-40"
                            style={{ background: "hsla(195,90%,48%,0.15)", color: "hsl(var(--cyan))" }}>
                            Подтвердить
                          </button>
                        )}
                        {!["delivered","cancelled"].includes(o.order_status as string) && (
                          <button onClick={() => setCancelModal(o.id as string)}
                            className="text-xs px-2 py-1 rounded text-rose-400 hover:bg-rose-400/10 transition-colors">
                            Отменить
                          </button>
                        )}
                      </div>
                    } />
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={page===0} onClick={() => setOffset(o=>Math.max(0,o-LIMIT))} className="px-3 py-1.5 text-xs rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">← Назад</button>
              <span className="text-xs text-muted-foreground">{page+1} / {pages}</span>
              <button disabled={page>=pages-1} onClick={() => setOffset(o=>o+LIMIT)} className="px-3 py-1.5 text-xs rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">Вперёд →</button>
            </div>
          )}
        </>
      )}

      {/* Модалка отмены заказа */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setCancelModal(null)}>
          <div className="rounded-xl border border-border p-6 w-full max-w-sm animate-fade-in" style={{ background: "hsl(var(--card))" }} onClick={e => e.stopPropagation()}>
            <div className="text-sm font-medium text-foreground mb-4">Причина отмены</div>
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3} placeholder="Укажите причину..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none resize-none mb-3" />
            <div className="flex gap-2">
              <button onClick={cancel} disabled={!cancelReason.trim()||actionLoading}
                className="flex-1 py-2 text-xs rounded-lg font-medium bg-rose-500 text-white disabled:opacity-40">Отменить заказ</button>
              <button onClick={() => setCancelModal(null)} className="flex-1 py-2 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground">Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка закрытия операционного дня */}
      {(dayStep === "preview" || dayStep === "running" || dayStep === "done") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={dayStep === "done" ? closeDayModal : undefined}>
          <div className="rounded-xl border border-border p-6 w-full max-w-md animate-fade-in" style={{ background: "hsl(var(--card))" }} onClick={e => e.stopPropagation()}>

            {/* Превью */}
            {(dayStep === "preview" || dayStep === "running") && (
              <>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "hsla(38,95%,55%,0.12)" }}>
                    <Icon name="Sunset" size={16} style={{ color: "hsl(var(--amber))" }} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Закрытие операционного дня</div>
                    <div className="text-xs text-muted-foreground">Проверьте данные перед подтверждением</div>
                  </div>
                </div>

                {previewItems.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    Нет заказов для выставления счетов
                  </div>
                ) : (
                  <>
                    {/* Сводка */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="rounded-lg p-3 text-center" style={{ background: "hsl(var(--secondary))" }}>
                        <div className="text-lg font-mono font-bold text-foreground">{previewInvoices}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">счетов</div>
                      </div>
                      <div className="rounded-lg p-3 text-center col-span-2" style={{ background: "hsl(var(--secondary))" }}>
                        <div className="text-lg font-mono font-bold" style={{ color: "hsl(var(--cyan))" }}>
                          {fmt(previewTotal)} ₽
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">итого к оплате</div>
                      </div>
                    </div>

                    {/* Список клиентов */}
                    <div className="rounded-lg border border-border overflow-hidden mb-5">
                      <div className="max-h-48 overflow-y-auto">
                        {previewItems.map((item, i) => (
                          <div key={item.company_id} className={`flex items-center justify-between px-3 py-2 text-xs ${i < previewItems.length - 1 ? "border-b border-border" : ""}`}>
                            <div>
                              <div className="text-foreground font-medium">{item.company_name}</div>
                              <div className="text-muted-foreground font-mono">{item.orders_count} заказ(ов)</div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-semibold text-foreground">{fmt(item.total_vat)} ₽</div>
                              <div className="text-muted-foreground font-mono text-[10px]">{item.invoice_number}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {dayErr && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-400 mb-3">
                    <Icon name="AlertCircle" size={12} />{dayErr}
                  </div>
                )}

                <div className="flex gap-2">
                  {previewItems.length > 0 && (
                    <button onClick={runCloseDay} disabled={dayStep === "running"}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs rounded-lg font-semibold transition-all disabled:opacity-40"
                      style={{ background: "hsl(var(--amber))", color: "hsl(var(--primary-foreground))" }}>
                      {dayStep === "running"
                        ? <><Icon name="Loader2" size={13} className="animate-spin" />Формирую счета...</>
                        : <><Icon name="Check" size={13} />Подтвердить</>}
                    </button>
                  )}
                  <button onClick={closeDayModal} disabled={dayStep === "running"}
                    className="flex-1 py-2.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
                    Отмена
                  </button>
                </div>
              </>
            )}

            {/* Результат */}
            {dayStep === "done" && dayResult && (
              <div className="text-center py-2">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: "hsla(142,70%,45%,0.12)" }}>
                  <Icon name="CheckCircle" size={24} style={{ color: "hsl(var(--green))" }} />
                </div>
                <div className="text-sm font-semibold text-foreground mb-1">День закрыт успешно</div>
                <div className="text-xs text-muted-foreground mb-5">
                  Сформировано <span className="font-mono font-semibold text-foreground">{dayResult.invoices_created}</span> счет(ов)
                </div>
                <button onClick={closeDayModal}
                  className="w-full py-2.5 text-xs rounded-lg font-medium"
                  style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
                  Закрыть
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
