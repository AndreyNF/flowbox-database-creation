import { useState, useEffect } from "react";
import { logistGet } from "@/lib/logistApi";
import Icon from "@/components/ui/icon";
import { Delivery, RoutePoint, DELIVERY_TYPES, METHOD_LABELS, fmtDate } from "./LogistTypes";
import { StatusBadge } from "./LogistDeliveryCard";

// ── Route section ───────────────────────────────────────────────────────────
export function RouteSection({ logistId }: { logistId: string }) {
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    logistGet("route_points", logistId)
      .then(d => setPoints(d.points || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [logistId]);

  const mapUrl = points.length > 0
    ? `https://yandex.ru/maps/?mode=routes&rtt=auto&${points.map((p) => `rtext=${encodeURIComponent(p.address)}`).join("&")}`
    : null;

  const navUrl = points.length > 0
    ? `yandexnavi://build_route_on_map?lat_to=${points[points.length-1].lat||""}&lon_to=${points[points.length-1].lon||""}`
    : null;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Маршрут на сегодня</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{points.length} точек</p>
        </div>
        <div className="flex gap-2">
          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-medium"
              style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
              <Icon name="Map" size={13} />
              Построить маршрут
            </a>
          )}
          {navUrl && (
            <a href={navUrl}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-border text-muted-foreground hover:text-foreground">
              <Icon name="Navigation" size={13} />
              Навигатор
            </a>
          )}
        </div>
      </div>

      {/* Yandex Map iframe */}
      <div className="rounded-2xl overflow-hidden border border-border" style={{ height: 320 }}>
        {loading ? (
          <div className="h-full flex items-center justify-center bg-secondary">
            <Icon name="Loader2" size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : points.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center bg-secondary gap-2">
            <Icon name="MapPin" size={28} className="text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">Точек маршрута нет</p>
          </div>
        ) : (
          <iframe
            title="Яндекс Карты"
            width="100%"
            height="100%"
            style={{ border: "none" }}
            src={`https://yandex.ru/map-widget/v1/?mode=routes&rtt=auto&${points.map(p => `rtext=${encodeURIComponent(p.address)}`).join("&")}`}
          />
        )}
      </div>

      {/* Points list */}
      {points.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden" style={{ background: "hsl(var(--card))" }}>
          {points.map((p, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-3.5 border-b border-border last:border-0">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold"
                style={{ background: p.type === "pickup" ? "hsla(195,90%,48%,0.15)" : "hsla(145,60%,42%,0.15)", color: p.type === "pickup" ? "hsl(var(--cyan))" : "hsl(var(--green))" }}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground">{p.name || (p.type === "pickup" ? "Забор" : "Доставка")}</div>
                <div className="text-[11px] text-muted-foreground truncate">{p.address}</div>
              </div>
              <a href={`https://yandex.ru/maps/?text=${encodeURIComponent(p.address)}`} target="_blank" rel="noreferrer"
                className="text-muted-foreground hover:text-foreground flex-shrink-0">
                <Icon name="ExternalLink" size={13} />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── History section ─────────────────────────────────────────────────────────
export function HistorySection({ logistId }: { logistId: string }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Delivery | null>(null);

  useEffect(() => {
    logistGet("history", logistId)
      .then(d => setDeliveries(d.deliveries || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [logistId]);

  if (detail) {
    return (
      <div className="space-y-4 animate-fade-in">
        <button onClick={() => setDetail(null)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Icon name="ArrowLeft" size={13} /> К истории
        </button>
        <div className="rounded-2xl border border-border p-5" style={{ background: "hsl(var(--card))" }}>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm font-semibold text-foreground">{DELIVERY_TYPES[detail.type] || detail.type}</span>
            <StatusBadge status={detail.status} />
          </div>
          <div className="space-y-2 text-xs">
            {[
              ["Дата", fmtDate(detail.task_date)],
              ["Метод", METHOD_LABELS[detail.delivery_method] || detail.delivery_method],
              ["Коробок", String(detail.total_boxes)],
              ["Трекинг", detail.tracking_number || "—"],
              ["Причина отказа", detail.reject_reason || "—"],
              ["Забран", detail.shipped_at ? fmtDate(detail.shipped_at) : "—"],
              ["Доставлен", detail.delivered_at ? fmtDate(detail.delivered_at) : "—"],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between border-b border-border pb-2 last:border-0">
                <span className="text-muted-foreground">{l}</span>
                <span className="text-foreground font-medium">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-foreground">История</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Последние 30 дней · {deliveries.length} заданий</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Icon name="Loader2" size={20} className="animate-spin text-muted-foreground" /></div>
      ) : deliveries.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">Заданий не найдено</div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden" style={{ background: "hsl(var(--card))" }}>
          {deliveries.map(d => (
            <div key={d.id} onClick={() => setDetail(d)}
              className="flex items-center justify-between px-5 py-4 border-b border-border last:border-0 hover:bg-secondary/40 transition-colors cursor-pointer">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground mb-0.5">{fmtDate(d.task_date)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {DELIVERY_TYPES[d.type] || d.type} · {d.orders_count || 0} зак. · {d.total_boxes} кор.
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                <StatusBadge status={d.status} />
                <Icon name="ChevronRight" size={14} className="text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
