import { useEffect, useState, useCallback } from "react";
import { adminGet, adminPost } from "@/lib/adminApi";
import {
  Loader, ErrMsg, SectionHdr, Card, Th, Td, EmptyRow,
  fmt, fmtDateTime, SecBtn, PriBtn,
} from "./shared";
import Icon from "@/components/ui/icon";

const STATUS_LABELS: Record<string, string> = {
  auto_matched:       "Авто", manual_matched: "Вручную",
  needs_distribution: "Нераспределён", underpayment: "Недоплата",
  unmatched:          "Не сопоставлен", overpayment: "Переплата",
};
const PROBLEM = new Set(["needs_distribution", "underpayment", "unmatched"]);

interface Tx {
  id: string; bank_operation_id: string; direction: string; counterparty_inn: string;
  company_name: string; amount: number; payment_purpose: string;
  match_status: string; received_at: string; invoice_number: string;
}

export default function AdminBank() {
  const [data, setData]       = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [dirF, setDirF]       = useState("");
  const [stF, setStF]         = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]   = useState("");
  const [polling, setPolling] = useState(false);

  const [activeRow, setActiveRow] = useState<string>("");
  const [matchCo, setMatchCo]   = useState("");
  const [matchInv, setMatchInv] = useState("");
  const [actLoading, setActLoading] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const ex: Record<string,string> = {};
    if (dirF)     ex.direction    = dirF;
    if (stF)      ex.match_status = stF;
    if (dateFrom) ex.date_from    = dateFrom;
    if (dateTo)   ex.date_to      = dateTo;
    adminGet("bank", ex)
      .then(setData)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [dirF, stF, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string, txId: string, extra: Record<string,unknown> = {}) {
    setActLoading(txId + action);
    try {
      await adminPost("bank_action", { action, bank_transaction_id: txId, ...extra });
      setActiveRow("");
      load();
    } catch(e:unknown) { setErr((e as Error).message); }
    finally { setActLoading(""); }
  }

  async function pollBank() {
    setPolling(true);
    try {
      await adminPost("bank_action", { action: "poll" });
      load();
    } catch(e:unknown) { setErr((e as Error).message); }
    finally { setPolling(false); }
  }

  const transactions = (data?.transactions as Tx[]) || [];
  const companies    = (data?.companies   as {id:string;name:string}[]) || [];
  const invoices     = (data?.invoices    as {id:string;invoice_number:string;amount:number}[]) || [];

  return (
    <div className="space-y-5 animate-fade-in">
      <SectionHdr title="Банк" sub="Транзакции и интеграция Точка" />
      {err && <ErrMsg msg={err} />}

      {/* Интеграция */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-medium text-foreground">Интеграция Точка</div>
          <div className="flex gap-2">
            <SecBtn onClick={pollBank} label={polling ? "Опрос..." : "Ручной опрос"} icon="RefreshCw" />
            <SecBtn onClick={pollBank} label="Проверить соединение" icon="Wifi" />
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Webhook URL</label>
          <div className="flex items-center gap-2">
            <input readOnly value={(data?.webhook_url as string) || "Не настроен"}
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-border bg-secondary/50 text-muted-foreground font-mono focus:outline-none" />
            <button onClick={() => navigator.clipboard.writeText((data?.webhook_url as string) || "")}
              className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
              <Icon name="Copy" size={13} />
            </button>
          </div>
        </div>
      </Card>

      {/* Фильтры */}
      <div className="flex gap-2 flex-wrap">
        <select value={dirF} onChange={e => setDirF(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none">
          <option value="">Все направления</option>
          <option value="incoming">Входящие</option>
          <option value="outgoing">Исходящие</option>
        </select>
        <select value={stF} onChange={e => setStF(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none">
          <option value="">Все статусы</option>
          {Object.entries(STATUS_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none" />
      </div>

      {loading ? <Loader /> : (
        <Card>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <Th c="Дата" /><Th c="ID операции" /><Th c="ИНН / Компания" /><Th c="Сумма" /><Th c="Назначение" /><Th c="Статус" /><Th c="Действия" />
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 && <EmptyRow cols={7} text="Транзакций нет" />}
              {transactions.map(tx => {
                const isProb = PROBLEM.has(tx.match_status);
                return (
                  <>
                    <tr key={tx.id}
                      className={`border-b border-border last:border-0 transition-colors ${isProb ? "bg-rose-400/5 hover:bg-rose-400/10" : "hover:bg-secondary/30"}`}>
                      <Td c={fmtDateTime(tx.received_at)} />
                      <Td mono c={<span className="text-[11px]">{tx.bank_operation_id?.slice(0, 12)}…</span>} />
                      <Td c={
                        <div>
                          <div className="font-mono text-[11px] text-muted-foreground">{tx.counterparty_inn}</div>
                          <div>{tx.company_name || "—"}</div>
                        </div>
                      } />
                      <Td c={<span className={`font-mono font-medium ${tx.direction === "incoming" ? "text-green-400" : "text-rose-400"}`}>{fmt(tx.amount)}</span>} />
                      <Td c={<span className="text-muted-foreground">{tx.payment_purpose?.slice(0, 40)}{tx.payment_purpose?.length > 40 ? "…" : ""}</span>} />
                      <Td c={
                        <span className={`text-xs font-medium ${isProb ? "text-rose-400" : "text-muted-foreground"}`}>
                          {STATUS_LABELS[tx.match_status] || tx.match_status}
                        </span>
                      } />
                      <Td c={
                        isProb ? (
                          <div className="flex gap-1">
                            <button onClick={() => setActiveRow(activeRow === tx.id ? "" : tx.id)}
                              className="px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-foreground">
                              Привязать
                            </button>
                            <button onClick={() => doAction("credit_balance", tx.id, { company_id: matchCo || undefined })}
                              disabled={!!actLoading}
                              className="px-2 py-1 text-[11px] rounded border border-blue-400/30 text-blue-400 hover:bg-blue-400/10 disabled:opacity-40">
                              В баланс
                            </button>
                            <button onClick={() => doAction("reject", tx.id)}
                              disabled={!!actLoading}
                              className="px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-rose-400 disabled:opacity-40">
                              Отклонить
                            </button>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>
                      } />
                    </tr>
                    {/* Inline форма привязки */}
                    {activeRow === tx.id && (
                      <tr key={tx.id + "_form"} className="bg-secondary/50">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex items-end gap-3">
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Компания</label>
                              <select value={matchCo} onChange={e => { setMatchCo(e.target.value); setMatchInv(""); }}
                                className="px-2 py-1.5 text-xs rounded border border-border bg-secondary text-foreground focus:outline-none">
                                <option value="">— Выберите —</option>
                                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground mb-1 block">Счёт</label>
                              <select value={matchInv} onChange={e => setMatchInv(e.target.value)}
                                className="px-2 py-1.5 text-xs rounded border border-border bg-secondary text-foreground focus:outline-none">
                                <option value="">— Выберите счёт —</option>
                                {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number} ({fmt(i.amount)})</option>)}
                              </select>
                            </div>
                            <PriBtn
                              onClick={() => doAction("match_invoice", tx.id, { company_id: matchCo, invoice_id: matchInv })}
                              label="Привязать" icon="Link" disabled={!matchCo || !matchInv}
                            />
                            <SecBtn onClick={() => setActiveRow("")} label="Отмена" />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
