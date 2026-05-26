import { useEffect, useState } from "react";
import { adminGet } from "@/lib/adminApi";
import { Loader, ErrMsg, SectionHdr, Card, MetricCard, fmt, fmtDate } from "./shared";

interface ChartPoint { date: string; amount: number; }
interface ClientPoint { month: string; count: number; }

export default function AdminOverview() {
  const [data, setData]     = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState("");

  useEffect(() => {
    adminGet("overview")
      .then(setData)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;
  if (err)     return <ErrMsg msg={err} />;
  if (!data)   return null;

  const revenueChart = (data.revenue_chart as ChartPoint[]) || [];
  const clientsChart = (data.clients_chart as ClientPoint[]) || [];
  const maxRev  = Math.max(...revenueChart.map(r => r.amount), 1);
  const maxCli  = Math.max(...clientsChart.map(c => c.count), 1);

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHdr title="Обзор платформы" sub="Сводные метрики" />

      {/* Метрики */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Клиентов всего"     value={String(data.clients_total)}     icon="Users"          />
        <MetricCard label="Заблокировано"       value={String(data.clients_blocked)}   icon="UserX"          color="--rose-400" />
        <MetricCard label="Оборот сегодня"      value={fmt(data.revenue_today as number)}  icon="TrendingUp" />
        <MetricCard label="Оборот за месяц"     value={fmt(data.revenue_month as number)}  icon="BarChart2"  />
        <MetricCard label="Заказов сегодня"     value={String(data.orders_today)}      icon="ShoppingCart"   />
        <MetricCard label="Заказов за месяц"    value={String(data.orders_month)}      icon="Package"        />
        <MetricCard label="Открытых рекламаций" value={String(data.open_claims)}       icon="AlertCircle"    color="--amber-400" />
        <MetricCard label="Нераспред. платежи"  value={String(data.unmatched_payments)} icon="Banknote"      color="--rose-400" />
      </div>

      {/* Графики */}
      <div className="grid grid-cols-2 gap-4">

        {/* Оборот по дням */}
        <Card className="p-5">
          <div className="text-sm font-medium text-foreground mb-4">Оборот по дням (30 дней)</div>
          {revenueChart.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Нет данных</p>
          ) : (
            <div className="flex items-end gap-0.5 h-32">
              {revenueChart.map((p, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group" title={`${fmtDate(p.date)}: ${fmt(p.amount)}`}>
                  <div
                    className="w-full rounded-sm transition-opacity group-hover:opacity-80"
                    style={{
                      height: `${Math.max(2, (p.amount / maxRev) * 100)}%`,
                      background: "hsl(var(--cyan))",
                      opacity: 0.7,
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
            <span>{revenueChart[0] ? fmtDate(revenueChart[0].date) : ""}</span>
            <span>{revenueChart[revenueChart.length - 1] ? fmtDate(revenueChart[revenueChart.length - 1].date) : ""}</span>
          </div>
        </Card>

        {/* Новые клиенты по месяцам */}
        <Card className="p-5">
          <div className="text-sm font-medium text-foreground mb-4">Новые клиенты по месяцам</div>
          {clientsChart.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Нет данных</p>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {clientsChart.map((p, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group" title={`${p.month}: ${p.count} клиентов`}>
                  <div
                    className="w-full rounded-sm transition-opacity group-hover:opacity-80"
                    style={{
                      height: `${Math.max(4, (p.count / maxCli) * 100)}%`,
                      background: "hsl(var(--green, 142 71% 45%))",
                      opacity: 0.8,
                    }}
                  />
                  <span className="text-[9px] text-muted-foreground truncate w-full text-center">{p.month.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Дополнительная метрика */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 flex items-center gap-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "hsla(195,90%,48%,0.1)" }}>
            <span className="text-lg font-mono font-bold" style={{ color: "hsl(var(--cyan))" }}>
              {fmt(data.revenue_total as number)}
            </span>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Общий оборот</div>
            <div className="text-sm font-semibold text-foreground mt-0.5">{fmt(data.revenue_total as number)}</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-400/10">
            <span className="text-xs font-bold text-amber-400">{data.overdue_clients as number}</span>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Клиентов с просрочкой</div>
            <div className="text-sm font-semibold text-amber-400 mt-0.5">{data.overdue_clients as number}</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
