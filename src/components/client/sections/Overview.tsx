import { useEffect, useState } from "react";
import { clientFetch } from "@/lib/clientApi";
import { MetricCard, ORDER_STATUS_MAP, StatusBadge, TableCard, Th, Td, EmptyRow, Loader, ErrorMsg, fmt, fmtDate, SectionHeader } from "../shared";
import Icon from "@/components/ui/icon";

interface Props { companyId: string; onOrderClick: (id: string) => void; }

interface ProfileData {
  marketplace?: string | null;
  edo_operator?: string | null;
  delivery_method?: string | null;
}

function IncompleteProfileBanner({ profile }: { profile: ProfileData }) {
  const missing: { label: string; critical: boolean }[] = [];
  if (!profile.marketplace)    missing.push({ label: "Маркетплейс (API-ключ)",   critical: true });
  if (!profile.delivery_method) missing.push({ label: "Способ доставки",          critical: false });
  if (!profile.edo_operator)   missing.push({ label: "ЭДО-оператор",              critical: false });

  if (missing.length === 0) return null;

  const hasCritical = missing.some(m => m.critical);

  return (
    <div className={`rounded-xl border px-4 py-3.5 flex items-start gap-3 ${
      hasCritical ? "border-rose-400/30 bg-rose-400/5" : "border-amber-400/30 bg-amber-400/5"
    }`}>
      <Icon
        name={hasCritical ? "AlertCircle" : "AlertTriangle"}
        size={16}
        className={`flex-shrink-0 mt-0.5 ${hasCritical ? "text-rose-400" : "text-amber-400"}`}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${hasCritical ? "text-rose-400" : "text-amber-400"}`}>
          Профиль заполнен не полностью
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Не заполнено: {missing.map(m => m.label).join(", ")}.
          {hasCritical && " Без маркетплейса заказы невозможны."}
        </p>
      </div>
      <a
        href="/onboarding"
        className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
          hasCritical
            ? "bg-rose-400/15 text-rose-400 hover:bg-rose-400/25"
            : "bg-amber-400/15 text-amber-400 hover:bg-amber-400/25"
        }`}
      >
        Заполнить →
      </a>
    </div>
  );
}

export default function Overview({ companyId, onOrderClick }: Props) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    clientFetch("overview", companyId)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [companyId]);

  if (loading) return <Loader />;
  if (error) return <ErrorMsg message={error} />;
  if (!data) return null;

  const orders  = (data.recent_orders as Record<string, unknown>[]) || [];
  const profile = (data.profile as ProfileData) || {};

  return (
    <div className="space-y-5 animate-fade-in">
      <SectionHeader title="Обзор" subtitle="Ваши ключевые показатели" />

      <IncompleteProfileBanner profile={profile} />

      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Активных заказов"   value={String(data.active_orders ?? 0)}    icon="ShoppingCart" color="var(--cyan)" />
        <MetricCard label="К оплате"           value={fmt(data.pending_amount as number)} icon="FileText"     color="var(--amber)" />
        <MetricCard label="Баланс"             value={fmt(data.balance as number)}        icon="Wallet"       color="var(--green)" />
        <MetricCard label="Товаров в каталоге" value={String(data.products_count ?? 0)}   icon="Package"      color="var(--violet)" />
      </div>

      <TableCard>
        <div className="px-5 py-4 border-b border-border">
          <span className="text-sm font-medium text-foreground">Последние заказы</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <Th>Номер</Th><Th>Товар</Th><Th>Статус</Th><Th>Сумма</Th><Th>Дата</Th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && <EmptyRow cols={5} text="Заказов пока нет" />}
            {orders.map((o) => (
              <tr key={o.id as string}
                onClick={() => onOrderClick(o.id as string)}
                className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors cursor-pointer">
                <Td mono>{o.order_number as string}</Td>
                <Td>{(o.product_name as string) || "—"}</Td>
                <Td><StatusBadge map={ORDER_STATUS_MAP} status={o.order_status as string} /></Td>
                <Td mono>{fmt(o.total_amount as number)}</Td>
                <Td>{fmtDate(o.created_at as string)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}
