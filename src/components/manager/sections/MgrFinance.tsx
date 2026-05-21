import { useEffect, useState } from "react";
import { mgrGet, mgrPost } from "@/lib/managerApi";
import { Loader, ErrMsg, SectionHdr, Card, MetCard, Th, Td, EmptyRow, Badge, INV_STATUS, fmt, fmtDate, Select } from "../shared";
import Icon from "@/components/ui/icon";

const MATCH_STATUS: Record<string, { l: string; c: string; bg: string }> = {
  auto_matched:      { l: "Автосопоставлен", c: "text-green-400",   bg: "bg-green-400/10" },
  manual_matched:    { l: "Вручную",          c: "text-cyan-400",    bg: "bg-cyan-400/10" },
  overpayment:       { l: "Переплата",        c: "text-amber-400",   bg: "bg-amber-400/10" },
  underpayment:      { l: "Недоплата",        c: "text-orange-400",  bg: "bg-orange-400/10" },
  needs_distribution:{ l: "Распределить",     c: "text-violet-400",  bg: "bg-violet-400/10" },
  unmatched:         { l: "Не сопоставлен",   c: "text-rose-400",    bg: "bg-rose-400/10" },
};

export default function MgrFinance() {
  const [d, setD] = useState<Record<string, unknown>|null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [invStatus, setInvStatus] = useState("");
  const [actionModal, setActionModal] = useState<{bt: Record<string,unknown>}|null>(null);
  const [invoiceId, setInvoiceId] = useState("");

  function load() {
    setLoading(true);
    const extra: Record<string,string> = {};
    if (invStatus) extra.inv_status = invStatus;
    mgrGet("finance", extra).then(setD).catch((e:Error)=>setErr(e.message)).finally(()=>setLoading(false));
  }
  useEffect(() => { load(); }, [invStatus]);

  async function doAction(action: string) {
    if (!actionModal) return;
    await mgrPost("bank_action", { action, bank_transaction_id: actionModal.bt.id, invoice_id: invoiceId });
    setActionModal(null); setInvoiceId(""); load();
  }

  if (loading) return <Loader />;
  if (err) return <ErrMsg msg={err} />;
  if (!d) return null;

  const invoices = (d.invoices as Record<string,unknown>[]) || [];
  const bts = (d.bank_transactions as Record<string,unknown>[]) || [];
  const problematic = bts.filter(b => !["auto_matched","manual_matched"].includes(b.match_status as string));
  const matched = bts.filter(b => ["auto_matched","manual_matched"].includes(b.match_status as string));

  return (
    <div className="space-y-5 animate-fade-in">
      <SectionHdr title="Финансы" sub="Дебиторская задолженность и банковские операции" />

      <div className="grid grid-cols-3 gap-4">
        <MetCard label="Дебиторская задолженность" value={fmt(d.total_receivable as number)} icon="TrendingUp" color="var(--amber)" />
        <MetCard label="Просроченные счета"         value={fmt(d.total_overdue as number)}    icon="AlertTriangle" color="var(--rose)" />
        <MetCard label="Компенсации к выплате"      value={fmt(d.compensations_pending as number)} icon="Wallet" color="var(--violet)" />
      </div>

      {/* Invoices */}
      <Card>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <span className="text-sm font-medium text-foreground">Счета</span>
          <Select value={invStatus} onChange={setInvStatus}
            options={[{value:"",label:"Все"},{value:"pending",label:"К оплате"},{value:"paid",label:"Оплачены"},{value:"overdue",label:"Просроченные"}]} />
        </div>
        <table className="w-full">
          <thead><tr className="border-b border-border"><Th c="Номер" /><Th c="Клиент" /><Th c="Сумма" /><Th c="Срок" /><Th c="Статус" /><Th c="Создан" /></tr></thead>
          <tbody>
            {invoices.length === 0 && <EmptyRow cols={6} />}
            {invoices.map(i => (
              <tr key={i.id as string} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                <Td c={i.invoice_number as string} mono />
                <Td c={i.company_name as string} />
                <Td c={fmt(i.amount as number)} mono />
                <Td c={fmtDate(i.due_date as string)} />
                <Td c={<Badge map={INV_STATUS} k={i.status as string} />} />
                <Td c={fmtDate(i.created_at as string)} />
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Bank transactions — problematic */}
      {problematic.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span className="text-sm font-medium text-foreground">Требуют внимания</span>
            <span className="text-xs text-muted-foreground ml-auto">{problematic.length}</span>
          </div>
          <table className="w-full">
            <thead><tr className="border-b border-border"><Th c="Дата" /><Th c="ИНН" /><Th c="Клиент" /><Th c="Сумма" /><Th c="Назначение" /><Th c="Статус" /><Th c="" /></tr></thead>
            <tbody>
              {problematic.map(bt => (
                <tr key={bt.id as string} className="border-b border-border last:border-0 hover:bg-secondary/30">
                  <Td c={fmtDate(bt.received_at as string)} />
                  <Td c={bt.counterparty_inn as string} mono />
                  <Td c={<span className="text-muted-foreground">{(bt.company_name as string)||"Неизвестно"}</span>} />
                  <Td c={fmt(bt.amount as number)} mono />
                  <Td c={<span className="text-muted-foreground text-[10px] max-w-32 truncate block">{bt.payment_purpose as string}</span>} />
                  <Td c={<Badge map={MATCH_STATUS} k={bt.match_status as string} />} />
                  <Td c={
                    <div className="flex gap-1">
                      <button onClick={() => setActionModal({ bt })} className="text-xs px-2 py-1 rounded font-medium"
                        style={{ background: "hsla(195,90%,48%,0.12)", color: "hsl(var(--cyan))" }}>
                        Привязать к счёту
                      </button>
                      <button onClick={() => mgrPost("bank_action",{action:"credit_balance",bank_transaction_id:bt.id}).then(()=>load())}
                        className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">
                        В баланс
                      </button>
                    </div>
                  } />
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Matched */}
      <Card>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-sm font-medium text-foreground">Сопоставленные операции</span>
          <span className="text-xs text-muted-foreground ml-auto">{matched.length}</span>
        </div>
        <table className="w-full">
          <thead><tr className="border-b border-border"><Th c="Дата" /><Th c="Направление" /><Th c="ИНН" /><Th c="Клиент" /><Th c="Сумма" /><Th c="Статус" /></tr></thead>
          <tbody>
            {matched.length === 0 && <EmptyRow cols={6} text="Нет сопоставленных" />}
            {matched.map(bt => (
              <tr key={bt.id as string} className="border-b border-border last:border-0">
                <Td c={fmtDate(bt.received_at as string)} />
                <Td c={bt.direction === "incoming" ? "Входящий" : "Исходящий"} />
                <Td c={bt.counterparty_inn as string} mono />
                <Td c={bt.company_name as string} />
                <Td c={fmt(bt.amount as number)} mono />
                <Td c={<Badge map={MATCH_STATUS} k={bt.match_status as string} />} />
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setActionModal(null)}>
          <div className="rounded-xl border border-border p-6 w-96 animate-fade-in" style={{ background: "hsl(var(--card))" }} onClick={e=>e.stopPropagation()}>
            <div className="text-sm font-medium text-foreground mb-1">Привязать к счёту</div>
            <div className="text-xs text-muted-foreground mb-4">{fmt(actionModal.bt.amount as number)} · {actionModal.bt.counterparty_inn as string}</div>
            <input value={invoiceId} onChange={e=>setInvoiceId(e.target.value)} placeholder="ID счёта (UUID)"
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none mb-3" />
            <div className="flex gap-2">
              <button onClick={() => doAction("match_invoice")} disabled={!invoiceId.trim()}
                className="flex-1 py-2 text-xs rounded-lg font-medium disabled:opacity-40"
                style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>Привязать</button>
              <button onClick={() => setActionModal(null)} className="flex-1 py-2 text-xs rounded-lg border border-border text-muted-foreground">Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
