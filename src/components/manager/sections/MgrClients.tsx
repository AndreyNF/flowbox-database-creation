import { useEffect, useState, useCallback } from "react";
import { mgrGet, mgrPost } from "@/lib/managerApi";
import { Loader, ErrMsg, SectionHdr, Card, Th, Td, EmptyRow, PriBtn, SecBtn, Badge, fmt, fmtDate, Input, Select, FieldLabel } from "../shared";
import Icon from "@/components/ui/icon";

const COMPANY_STATUS: Record<string, { l: string; c: string; bg: string }> = {
  onboarding: { l: "Онбординг", c: "text-blue-400",    bg: "bg-blue-400/10" },
  active:     { l: "Активна",   c: "text-green-400",   bg: "bg-green-400/10" },
  suspended:  { l: "Заморожена",c: "text-amber-400",   bg: "bg-amber-400/10" },
  blocked:    { l: "Заблокирована", c: "text-rose-400", bg: "bg-rose-400/10" },
};

interface Props { initialClientId?: string; }

export default function MgrClients({ initialClientId }: Props) {
  const [clients, setClients] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [limitInput, setLimitInput] = useState("");
  const LIMIT = 20;

  const load = useCallback(() => {
    setLoading(true);
    const extra: Record<string, string> = { limit: String(LIMIT), offset: String(offset) };
    if (statusFilter) extra.status = statusFilter;
    if (search) extra.search = search;
    mgrGet("clients", extra)
      .then(d => { setClients(d.clients || []); setTotal(d.total || 0); })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [statusFilter, search, offset]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { if (initialClientId) loadDetail(initialClientId); }, [initialClientId]);

  async function loadDetail(id: string) {
    setDetailLoading(true);
    try {
      const d = await mgrGet("client_detail", { company_id: id });
      setDetail(d);
      setLimitInput(String(d.company.purchase_limit || 0));
    } catch (e: Error) { setErr((e as Error).message); }
    finally { setDetailLoading(false); }
  }

  async function doAction(action: string, extra?: Record<string, unknown>) {
    if (!detail) return;
    await mgrPost("client_update", { action, company_id: (detail.company as Record<string, unknown>).id, ...extra });
    loadDetail((detail.company as Record<string, unknown>).id as string);
  }

  const pages = Math.ceil(total / LIMIT);
  const page = Math.floor(offset / LIMIT);

  if (detail) {
    const co = detail.company as Record<string, unknown>;
    const orders = (detail.orders as Record<string, unknown>[]) || [];
    const invoices = (detail.invoices as Record<string, unknown>[]) || [];
    const txs = (detail.transactions as Record<string, unknown>[]) || [];

    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetail(null)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="ArrowLeft" size={13} /> К списку
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium text-foreground">{co.name as string}</span>
          <Badge map={COMPANY_STATUS} k={co.status as string} />
        </div>
        {detailLoading ? <Loader /> : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-5 col-span-2">
                <div className="text-sm font-medium text-foreground mb-4">Реквизиты</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {[["ИНН", co.inn], ["КПП", co.kpp], ["ОГРН", co.ogrn], ["Email", co.email],
                    ["Телефон", co.phone], ["Контакт", co.contact_person],
                    ["Маркетплейс", co.marketplace], ["ЭДО", co.edo_operator]].map(([l, v]) => (
                    <div key={l as string} className="flex gap-2">
                      <span className="text-xs text-muted-foreground w-24 flex-shrink-0">{l as string}:</span>
                      <span className="text-xs text-foreground">{(v as string) || "—"}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <div className="space-y-3">
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-1">Баланс</div>
                  <div className="font-mono text-xl font-semibold text-foreground">{fmt(detail.balance as number)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground mb-2">Лимит закупки</div>
                  <div className="flex gap-2">
                    <input value={limitInput} onChange={e => setLimitInput(e.target.value)} type="number"
                      className="flex-1 px-2 py-1.5 text-xs rounded border border-border bg-secondary text-foreground focus:outline-none" />
                    <button onClick={() => doAction("set_limit", { limit: parseFloat(limitInput) || 0 })}
                      className="px-2 py-1.5 text-xs rounded font-medium"
                      style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
                      OK
                    </button>
                  </div>
                </Card>
                <div className="flex gap-2">
                  {co.status !== "blocked"
                    ? <button onClick={() => doAction("block")}
                        className="flex-1 py-2 text-xs rounded-lg border border-rose-400/30 text-rose-400 hover:bg-rose-400/10 font-medium transition-all">
                        Заблокировать
                      </button>
                    : <button onClick={() => doAction("unblock")}
                        className="flex-1 py-2 text-xs rounded-lg border border-green-400/30 text-green-400 hover:bg-green-400/10 font-medium transition-all">
                        Разблокировать
                      </button>
                  }
                </div>
              </div>
            </div>

            {/* Orders */}
            <Card>
              <div className="px-5 py-3 border-b border-border text-sm font-medium text-foreground">Заказы</div>
              <table className="w-full">
                <thead><tr className="border-b border-border"><Th c="Номер" /><Th c="Сумма" /><Th c="Статус" /><Th c="Дата" /></tr></thead>
                <tbody>
                  {orders.length === 0 && <EmptyRow cols={4} text="Заказов нет" />}
                  {orders.map(o => (
                    <tr key={o.id as string} className="border-b border-border last:border-0">
                      <Td c={o.order_number as string} mono /><Td c={fmt(o.total_amount as number)} mono />
                      <Td c={<Badge map={{ new:{l:"Новый",c:"text-muted-foreground",bg:""}, confirmed:{l:"Подтверждён",c:"text-blue-400",bg:"bg-blue-400/10"}, delivered:{l:"Доставлен",c:"text-green-400",bg:"bg-green-400/10"}, cancelled:{l:"Отменён",c:"text-rose-400",bg:"bg-rose-400/10"} }} k={o.order_status as string} />} />
                      <Td c={fmtDate(o.created_at as string)} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Invoices */}
            <Card>
              <div className="px-5 py-3 border-b border-border text-sm font-medium text-foreground">Счета</div>
              <table className="w-full">
                <thead><tr className="border-b border-border"><Th c="Номер" /><Th c="Сумма" /><Th c="Статус" /><Th c="Дата" /></tr></thead>
                <tbody>
                  {invoices.length === 0 && <EmptyRow cols={4} text="Счетов нет" />}
                  {invoices.map(i => (
                    <tr key={i.id as string} className="border-b border-border last:border-0">
                      <Td c={i.invoice_number as string} mono /><Td c={fmt(i.amount as number)} mono />
                      <Td c={<Badge map={{ pending:{l:"К оплате",c:"text-amber-400",bg:"bg-amber-400/10"}, paid:{l:"Оплачен",c:"text-green-400",bg:"bg-green-400/10"}, overdue:{l:"Просрочен",c:"text-rose-400",bg:"bg-rose-400/10"} }} k={i.status as string} />} />
                      <Td c={fmtDate(i.created_at as string)} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Transactions */}
            <Card>
              <div className="px-5 py-3 border-b border-border text-sm font-medium text-foreground">Транзакции</div>
              <table className="w-full">
                <thead><tr className="border-b border-border"><Th c="Дата" /><Th c="Тип" /><Th c="Сумма" /><Th c="Баланс после" /></tr></thead>
                <tbody>
                  {txs.length === 0 && <EmptyRow cols={4} text="Транзакций нет" />}
                  {txs.map(tx => (
                    <tr key={tx.id as string} className="border-b border-border last:border-0">
                      <Td c={fmtDate(tx.created_at as string)} /><Td c={tx.type as string} />
                      <Td c={<span className={`font-mono text-xs ${(tx.type as string).includes("received")||(tx.type as string).includes("accrued") ? "text-green-400" : "text-rose-400"}`}>{fmt(tx.amount as number)}</span>} />
                      <Td c={fmt(tx.balance_after as number)} mono />
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <SectionHdr title="Клиенты" sub={`Всего: ${total}`}
        action={<PriBtn onClick={() => window.location.href="/onboarding"} label="Зарегистрировать" icon="Plus" />} />
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Icon name="Search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} placeholder="Поиск по названию или ИНН..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none" />
        </div>
        <Select value={statusFilter} onChange={v => { setStatusFilter(v); setOffset(0); }}
          options={[{value:"",label:"Все статусы"},{value:"active",label:"Активные"},{value:"onboarding",label:"Онбординг"},{value:"blocked",label:"Заблокированные"}]} />
      </div>
      {err && <ErrMsg msg={err} />}
      {loading ? <Loader /> : (
        <>
          <Card>
            <table className="w-full">
              <thead><tr className="border-b border-border">
                <Th c="Компания" /><Th c="ИНН" /><Th c="Статус" /><Th c="Баланс" /><Th c="Активных заказов" /><Th c="Лимит" /><Th c="Дата" />
              </tr></thead>
              <tbody>
                {clients.length === 0 && <EmptyRow cols={7} />}
                {clients.map(c => (
                  <tr key={c.id as string} onClick={() => loadDetail(c.id as string)}
                    className="border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer transition-colors">
                    <Td c={<span className="font-medium">{c.name as string}</span>} />
                    <Td c={c.inn as string} mono />
                    <Td c={<Badge map={COMPANY_STATUS} k={c.status as string} />} />
                    <Td c={fmt(c.balance as number)} mono />
                    <Td c={fmt(c.active_orders_sum as number)} mono />
                    <Td c={c.purchase_limit ? fmt(c.purchase_limit as number) : "∞"} mono />
                    <Td c={fmtDate(c.created_at as string)} />
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button disabled={page===0} onClick={() => setOffset(o => Math.max(0,o-LIMIT))} className="px-3 py-1.5 text-xs rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">← Назад</button>
              <span className="text-xs text-muted-foreground">{page+1} / {pages}</span>
              <button disabled={page>=pages-1} onClick={() => setOffset(o => o+LIMIT)} className="px-3 py-1.5 text-xs rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">Вперёд →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
