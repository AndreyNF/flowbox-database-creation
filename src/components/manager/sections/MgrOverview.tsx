import { useEffect, useState } from "react";
import { mgrGet } from "@/lib/managerApi";
import { Loader, ErrMsg, SectionHdr, MetCard, Card, fmt, fmtDate } from "../shared";
import Icon from "@/components/ui/icon";

interface Props { onClientClick: (id: string) => void; onClaimClick: (id: string) => void; }

export default function MgrOverview({ onClientClick, onClaimClick }: Props) {
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    mgrGet("overview").then(setD).catch((e: Error) => setErr(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;
  if (err) return <ErrMsg msg={err} />;
  if (!d) return null;

  const underpayments = (d.underpayments as Record<string, unknown>[]) || [];
  const unmatched = (d.unmatched as Record<string, unknown>[]) || [];
  const staleClaims = (d.stale_claims as Record<string, unknown>[]) || [];
  const overdueClients = (d.overdue_clients as Record<string, unknown>[]) || [];
  const attentionCount = underpayments.length + unmatched.length + staleClaims.length + overdueClients.length;

  return (
    <div className="space-y-5 animate-fade-in">
      <SectionHdr title="Обзор" sub={`Требуют внимания: ${attentionCount} позиций`} />

      <div className="grid grid-cols-4 gap-4">
        <MetCard label="Заказов сегодня"       value={String(d.orders_today ?? 0)}    icon="ShoppingCart"  color="var(--cyan)" />
        <MetCard label="К отгрузке"             value={String(d.to_ship ?? 0)}         icon="Truck"         color="var(--amber)" />
        <MetCard label="Просроченных счетов"    value={String(d.overdue_invoices ?? 0)} icon="FileWarning"  color="var(--rose)" />
        <MetCard label="Открытых рекламаций"    value={String(d.open_claims ?? 0)}     icon="AlertOctagon"  color="var(--violet)" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Underpayments */}
        <Card>
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-sm font-medium text-foreground">Недоплаты</span>
            <span className="text-xs text-muted-foreground ml-auto">{underpayments.length}</span>
          </div>
          {underpayments.length === 0
            ? <p className="px-5 py-6 text-xs text-muted-foreground text-center">Нет недоплат</p>
            : underpayments.map(r => (
              <div key={r.id as string} className="flex items-center justify-between px-5 py-3 border-b border-border last:border-0 hover:bg-secondary/30">
                <div>
                  <div className="text-xs font-medium text-foreground">{r.counterparty_inn as string}</div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-52">{r.payment_purpose as string}</div>
                </div>
                <span className="font-mono text-xs text-amber-400 ml-4 flex-shrink-0">{fmt(r.amount as number)}</span>
              </div>
            ))
          }
        </Card>

        {/* Unmatched */}
        <Card>
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span className="text-sm font-medium text-foreground">Нераспределённые платежи</span>
            <span className="text-xs text-muted-foreground ml-auto">{unmatched.length}</span>
          </div>
          {unmatched.length === 0
            ? <p className="px-5 py-6 text-xs text-muted-foreground text-center">Нет нераспределённых</p>
            : unmatched.map(r => (
              <div key={r.id as string} className="flex items-center justify-between px-5 py-3 border-b border-border last:border-0 hover:bg-secondary/30">
                <div>
                  <div className="text-xs font-medium text-foreground">{r.counterparty_inn as string}</div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-52">{r.payment_purpose as string}</div>
                </div>
                <span className="font-mono text-xs text-rose-400 ml-4 flex-shrink-0">{fmt(r.amount as number)}</span>
              </div>
            ))
          }
        </Card>

        {/* Stale claims */}
        <Card>
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
            <span className="w-2 h-2 rounded-full bg-violet-400" />
            <span className="text-sm font-medium text-foreground">Рекламации без ответа &gt;24ч</span>
            <span className="text-xs text-muted-foreground ml-auto">{staleClaims.length}</span>
          </div>
          {staleClaims.length === 0
            ? <p className="px-5 py-6 text-xs text-muted-foreground text-center">Все рекламации обработаны</p>
            : staleClaims.map(r => (
              <div key={r.id as string} onClick={() => onClaimClick(r.id as string)}
                className="flex items-center justify-between px-5 py-3 border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer">
                <div>
                  <div className="text-xs font-medium text-foreground">{r.claim_number as string}</div>
                  <div className="text-[10px] text-muted-foreground">{r.company_name as string}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground">{fmtDate(r.created_at as string)}</div>
                  <Icon name="ArrowRight" size={11} className="text-muted-foreground ml-auto" />
                </div>
              </div>
            ))
          }
        </Card>

        {/* Overdue clients */}
        <Card>
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
            <span className="w-2 h-2 rounded-full bg-orange-400" />
            <span className="text-sm font-medium text-foreground">Клиенты с просроченными счетами</span>
            <span className="text-xs text-muted-foreground ml-auto">{overdueClients.length}</span>
          </div>
          {overdueClients.length === 0
            ? <p className="px-5 py-6 text-xs text-muted-foreground text-center">Просрочек нет</p>
            : overdueClients.map(r => (
              <div key={r.id as string} onClick={() => onClientClick(r.id as string)}
                className="flex items-center justify-between px-5 py-3 border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer">
                <span className="text-xs font-medium text-foreground">{r.name as string}</span>
                <span className="text-xs text-rose-400 font-mono">{r.count as number} счёт(ов)</span>
              </div>
            ))
          }
        </Card>
      </div>
    </div>
  );
}
