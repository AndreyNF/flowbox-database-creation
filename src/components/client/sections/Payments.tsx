import { useEffect, useState } from "react";
import { clientFetch } from "@/lib/clientApi";
import Icon from "@/components/ui/icon";
import {
  INVOICE_STATUS_MAP, StatusBadge, TableCard, Th, Td, EmptyRow,
  Loader, ErrorMsg, SectionHeader, MetricCard, fmt, fmtDate,
} from "../shared";

interface Props { companyId: string; }

type Tab = "invoices" | "bank" | "history";

const TX_LABELS: Record<string, { label: string; sign: "+" | "−" }> = {
  invoice_issued:       { label: "Выставлен счёт",        sign: "−" },
  payment_received:     { label: "Поступление оплаты",    sign: "+" },
  compensation_accrued: { label: "Начислена компенсация", sign: "+" },
  compensation_paid:    { label: "Выплата компенсации",   sign: "−" },
  balance_used:         { label: "Зачислено на баланс",   sign: "+" },
};

const MATCH_COLOR: Record<string, string> = {
  auto_matched:       "text-green-400 bg-green-400/10",
  manual_matched:     "text-green-400 bg-green-400/10",
  overpayment:        "text-cyan-400 bg-cyan-400/10",
  underpayment:       "text-amber-400 bg-amber-400/10",
  needs_distribution: "text-amber-400 bg-amber-400/10",
  unmatched:          "text-muted-foreground bg-secondary",
};

export default function Payments({ companyId }: Props) {
  const [data, setData]     = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");
  const [tab, setTab]       = useState<Tab>("invoices");

  useEffect(() => {
    setLoading(true);
    clientFetch("payments", companyId)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [companyId]);

  if (loading) return <Loader />;
  if (error)   return <ErrorMsg message={error} />;
  if (!data)   return null;

  const invoices    = (data.invoices     as Record<string, unknown>[]) || [];
  const bankPayments= (data.bank_payments as Record<string, unknown>[]) || [];
  const transactions= (data.transactions  as Record<string, unknown>[]) || [];

  const balance       = Number(data.balance)        || 0;
  const pendingAmount = Number(data.pending_amount) || 0;
  const overdueAmount = Number(data.overdue_amount) || 0;
  const paidThisMonth = Number(data.paid_this_month)|| 0;

  const pendingInvoices = invoices.filter(i => i.status === "pending");
  const overdueInvoices = invoices.filter(i => i.status === "overdue");

  return (
    <div className="space-y-5 animate-fade-in">
      <SectionHeader
        title="Платежи"
        subtitle="История оплат, счета и поступления"
      />

      {/* Метрики */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Баланс"
          value={fmt(balance)}
          icon="Wallet"
          color="var(--green)"
          sub={balance > 0 ? "Доступно к зачёту" : undefined}
        />
        <MetricCard
          label="К оплате"
          value={fmt(pendingAmount)}
          icon="Clock"
          color="var(--amber)"
          sub={pendingInvoices.length > 0 ? `${pendingInvoices.length} счёт(а)` : "Нет открытых"}
        />
        <MetricCard
          label="Просрочено"
          value={fmt(overdueAmount)}
          icon="AlertCircle"
          color="var(--rose)"
          sub={overdueInvoices.length > 0 ? `${overdueInvoices.length} счёт(а)` : undefined}
        />
        <MetricCard
          label="Оплачено за месяц"
          value={fmt(paidThisMonth)}
          icon="CheckCircle"
          color="var(--cyan)"
        />
      </div>

      {/* Просроченные счета — предупреждение */}
      {overdueInvoices.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-400/5 px-4 py-3">
          <Icon name="AlertTriangle" size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-rose-400">
              {overdueInvoices.length === 1 ? "1 просроченный счёт" : `${overdueInvoices.length} просроченных счёта`}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {overdueInvoices.map(i => `${i.invoice_number as string} на ${fmt(i.amount as number)}`).join(", ")}
            </div>
          </div>
        </div>
      )}

      {/* Баланс-подсказка */}
      {balance > 0 && pendingAmount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3">
          <Icon name="Info" size={15} className="flex-shrink-0 mt-0.5" style={{ color: "hsl(var(--cyan))" }} />
          <div className="text-xs text-muted-foreground">
            На вашем балансе {fmt(balance)} — менеджер может зачесть их в счёт следующего платежа.
          </div>
        </div>
      )}

      {/* Вкладки */}
      <div className="flex gap-1 p-1 rounded-xl border border-border" style={{ background: "hsl(var(--secondary))" }}>
        {([
          { id: "invoices", label: "Счета",        icon: "FileText",  count: invoices.length },
          { id: "bank",     label: "Поступления",  icon: "Banknote",  count: bankPayments.length },
          { id: "history",  label: "История",      icon: "History",   count: transactions.length },
        ] as { id: Tab; label: string; icon: string; count: number }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
              tab === t.id
                ? "text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={tab === t.id ? { background: "hsl(var(--card))" } : {}}
          >
            <Icon name={t.icon} size={12} />
            {t.label}
            {t.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                tab === t.id ? "bg-secondary text-foreground" : "text-muted-foreground"
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── СЧЕТА ── */}
      {tab === "invoices" && (
        <TableCard>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <Th>Счёт</Th>
                <Th>Выставлен</Th>
                <Th>Срок оплаты</Th>
                <Th>Оплачен</Th>
                <Th>Сумма</Th>
                <Th>Статус</Th>
                <Th>PDF</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && <EmptyRow cols={7} text="Счетов пока нет" />}
              {invoices.map(inv => {
                const isOverdue = inv.status === "overdue";
                const isPending = inv.status === "pending";
                return (
                  <tr
                    key={inv.id as string}
                    className={`border-b border-border last:border-0 transition-colors ${
                      isOverdue ? "bg-rose-400/3" : isPending ? "bg-amber-400/3" : "hover:bg-secondary/30"
                    }`}
                  >
                    <Td mono>
                      <span className="font-medium">{inv.invoice_number as string}</span>
                    </Td>
                    <Td>{fmtDate(inv.created_at as string)}</Td>
                    <Td>
                      <span className={isOverdue ? "text-rose-400 font-medium" : ""}>
                        {fmtDate(inv.due_date as string)}
                      </span>
                    </Td>
                    <Td>{inv.paid_at ? fmtDate(inv.paid_at as string) : <span className="text-muted-foreground">—</span>}</Td>
                    <Td>
                      <div className="font-mono text-xs">
                        {fmt(inv.amount as number)}
                        {(inv.overpayment_amount as number) > 0 && (
                          <div className="text-[10px] text-cyan-400 mt-0.5">
                            +{fmt(inv.overpayment_amount as number)} переплата → баланс
                          </div>
                        )}
                      </div>
                    </Td>
                    <Td><StatusBadge map={INVOICE_STATUS_MAP} status={inv.status as string} /></Td>
                    <Td>
                      {inv.pdf_url
                        ? <a href={inv.pdf_url as string} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
                            style={{ color: "hsl(var(--cyan))" }}>
                            <Icon name="Download" size={12} /> Скачать
                          </a>
                        : <span className="text-xs text-muted-foreground">—</span>
                      }
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableCard>
      )}

      {/* ── ПОСТУПЛЕНИЯ ── */}
      {tab === "bank" && (
        <>
          {bankPayments.length === 0 ? (
            <div className="rounded-xl border border-border p-10 text-center" style={{ background: "hsl(var(--card))" }}>
              <Icon name="Banknote" size={28} className="text-muted-foreground mx-auto mb-3" />
              <div className="text-sm text-muted-foreground">Банковских поступлений пока нет</div>
              <div className="text-xs text-muted-foreground mt-1">
                Они появятся здесь после оплаты счёта
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {bankPayments.map(p => {
                const matchCls = MATCH_COLOR[p.match_status as string] || "text-muted-foreground bg-secondary";
                const isMatched = ["auto_matched", "manual_matched"].includes(p.match_status as string);
                return (
                  <div
                    key={p.id as string}
                    className="rounded-xl border border-border px-4 py-3.5 flex items-center gap-4"
                    style={{ background: "hsl(var(--card))" }}
                  >
                    {/* Иконка */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isMatched ? "bg-green-400/10" : "bg-secondary"
                    }`}>
                      <Icon
                        name={isMatched ? "CheckCircle" : "Clock"}
                        size={16}
                        className={isMatched ? "text-green-400" : "text-muted-foreground"}
                      />
                    </div>

                    {/* Основная информация */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-mono font-semibold text-foreground">
                          {fmt(p.amount as number)}
                        </span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${matchCls}`}>
                          {p.match_label as string}
                        </span>
                        {p.invoice_number && (
                          <span className="text-[10px] text-muted-foreground">
                            → {p.invoice_number as string}
                          </span>
                        )}
                        {(p.overpayment_amount as number) > 0 && (
                          <span className="text-[10px] text-cyan-400">
                            +{fmt(p.overpayment_amount as number)} на баланс
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
                        {(p.payment_purpose as string) || "Назначение не указано"}
                      </div>
                    </div>

                    {/* Дата */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs text-muted-foreground">
                        {fmtDate(p.operation_date as string || p.received_at as string)}
                      </div>
                      {p.bank_operation_id && (
                        <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                          #{(p.bank_operation_id as string).slice(-8)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── ИСТОРИЯ ТРАНЗАКЦИЙ ── */}
      {tab === "history" && (
        <div className="space-y-2">
          {transactions.length === 0 && (
            <div className="rounded-xl border border-border p-10 text-center" style={{ background: "hsl(var(--card))" }}>
              <Icon name="History" size={28} className="text-muted-foreground mx-auto mb-3" />
              <div className="text-sm text-muted-foreground">История пуста</div>
            </div>
          )}
          {transactions.map(tx => {
            const info = TX_LABELS[tx.type as string] || { label: tx.type as string, sign: "+" as const };
            const isPlus = info.sign === "+";
            return (
              <div
                key={tx.id as string}
                className="rounded-xl border border-border px-4 py-3 flex items-center gap-3"
                style={{ background: "hsl(var(--card))" }}
              >
                {/* Иконка */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isPlus ? "bg-green-400/10" : "bg-rose-400/10"
                }`}>
                  <Icon
                    name={isPlus ? "ArrowDownLeft" : "ArrowUpRight"}
                    size={14}
                    className={isPlus ? "text-green-400" : "text-rose-400"}
                  />
                </div>

                {/* Описание */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground">{info.label}</div>
                  {(tx.comment as string) && (
                    <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-xs">
                      {tx.comment as string}
                    </div>
                  )}
                </div>

                {/* Сумма + дата */}
                <div className="text-right flex-shrink-0">
                  <div className={`text-sm font-mono font-semibold ${isPlus ? "text-green-400" : "text-rose-400"}`}>
                    {info.sign}{fmt(tx.amount as number)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {fmtDate(tx.created_at as string)}
                  </div>
                </div>

                {/* Баланс после */}
                <div className="text-right flex-shrink-0 hidden sm:block pl-3 border-l border-border">
                  <div className="text-[10px] text-muted-foreground">баланс</div>
                  <div className="text-xs font-mono text-foreground mt-0.5">
                    {fmt(tx.balance_after as number)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
