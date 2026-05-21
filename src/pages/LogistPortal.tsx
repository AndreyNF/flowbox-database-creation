import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, logout } from "@/lib/auth";
import { logistGet, logistPost } from "@/lib/logistApi";
import Icon from "@/components/ui/icon";

type Section = "tasks" | "route" | "history";

// ── types ──────────────────────────────────────────────────────────────────
interface Order {
  id: string; order_number: string; product_name: string;
  quantity: number; total_amount: number; company_name?: string;
}
interface Delivery {
  id: string;
  type: string;
  delivery_method: string;
  fulfillment_scheme: string;
  rfbs_subtype: string;
  route_points: RoutePoint[] | null;
  total_boxes: number;
  labels_pdf: string | null;
  act_pdf: string | null;
  transfer_act_pdf: string | null;
  ttn_id: string | null;
  tracking_number: string | null;
  status: string;
  reject_reason: string | null;
  task_date: string;
  shipped_at: string | null;
  delivered_at: string | null;
  supplier_name: string | null;
  supplier_warehouse_address: string | null;
  supplier_pickup_hours: string | null;
  orders: Order[];
  orders_count?: number;
}
interface RoutePoint {
  type: "pickup" | "delivery"; address: string; name?: string;
  lat?: number; lon?: number; delivery_id?: string;
}

// ── constants ──────────────────────────────────────────────────────────────
const DELIVERY_TYPES: Record<string, string> = {
  to_buyer:             "К покупателю",
  to_tc:                "До ТК",
  return_from_buyer:    "Возврат от покупателя",
  return_to_supplier:   "Возврат поставщику",
};
const STATUS_LABELS: Record<string, { l: string; c: string; bg: string }> = {
  new:                  { l: "Новое",                c: "text-muted-foreground", bg: "bg-secondary" },
  picked_from_supplier: { l: "Забран у поставщика",  c: "text-blue-400",        bg: "bg-blue-400/10" },
  in_transit:           { l: "В дороге",             c: "text-amber-400",       bg: "bg-amber-400/10" },
  handed_to_tc:         { l: "Сдан в ТК",            c: "text-violet-400",      bg: "bg-violet-400/10" },
  delivered:            { l: "Доставлен",            c: "text-green-400",       bg: "bg-green-400/10" },
  refused:              { l: "Отказ",                c: "text-rose-400",        bg: "bg-rose-400/10" },
};
const METHOD_LABELS: Record<string, string> = {
  own:            "Наша служба",
  ozon_partner_tc:"Партнёры Ozon",
  third_party_tc: "Сторонняя ТК",
};

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "₽ " + Number(n).toLocaleString("ru", { maximumFractionDigits: 0 });
}
function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] || { l: status, c: "text-muted-foreground", bg: "bg-secondary" };
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.c} ${s.bg}`}>{s.l}</span>;
}

// ── Delivery Card ──────────────────────────────────────────────────────────
function DeliveryCard({ d, onStatusChange }: { d: Delivery; onStatusChange: (id: string, status: string, reason?: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [localStatus, setLocalStatus] = useState(d.status);

  const isOwn = d.delivery_method === "own";
  const isOzonPartner = d.delivery_method === "ozon_partner_tc";

  async function doStatus(status: string, reason?: string) {
    setLoading(true);
    try {
      await onStatusChange(d.id, status, reason);
      setLocalStatus(status);
      setRejectMode(false);
    } finally { setLoading(false); }
  }

  const routePoints = d.route_points || [];
  const destination = routePoints.find(p => p.type === "delivery");

  return (
    <div className="rounded-2xl border border-border overflow-hidden" style={{ background: "hsl(var(--card))" }}>
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-foreground">
                {DELIVERY_TYPES[d.type] || d.type}
              </span>
              <StatusBadge status={localStatus} />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon name="Package" size={12} />
              {METHOD_LABELS[d.delivery_method] || d.delivery_method}
              <span>·</span>
              <Icon name="Box" size={12} />
              {d.total_boxes} кор.
            </div>
          </div>
          <button onClick={() => setExpanded(v => !v)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all flex-shrink-0">
            <Icon name={expanded ? "ChevronUp" : "ChevronDown"} size={16} />
          </button>
        </div>

        {/* Route summary */}
        <div className="space-y-2">
          {d.supplier_name && (
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: "hsla(195,90%,48%,0.15)" }}>
                <Icon name="ArrowUpFromLine" size={10} style={{ color: "hsl(var(--cyan))" }} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground">{d.supplier_name}</div>
                {d.supplier_warehouse_address && (
                  <div className="text-[10px] text-muted-foreground truncate">{d.supplier_warehouse_address}</div>
                )}
                {d.supplier_pickup_hours && (
                  <div className="text-[10px] text-muted-foreground">⏰ {d.supplier_pickup_hours}</div>
                )}
              </div>
            </div>
          )}
          {destination && (
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: "hsla(145,60%,42%,0.15)" }}>
                <Icon name="MapPin" size={10} className="text-green-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground">{destination.name || "Получатель"}</div>
                <div className="text-[10px] text-muted-foreground truncate">{destination.address}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Expanded: orders + docs */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-4 animate-fade-in">
          {/* Orders */}
          {d.orders.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Заказы</div>
              <div className="space-y-2">
                {d.orders.map(o => (
                  <div key={o.id} className="flex items-center justify-between text-xs py-2 border-b border-border last:border-0">
                    <div>
                      <span className="font-mono text-muted-foreground mr-2">{o.order_number}</span>
                      <span className="text-foreground">{o.product_name || "—"}</span>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <div className="font-medium text-foreground">{o.quantity} шт.</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documents */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Документы</div>
            <div className="flex flex-wrap gap-2">
              {(isOzonPartner || d.rfbs_subtype === "express") && (
                <>
                  <DocBtn label="Этикетки" icon="Tag" url={d.labels_pdf} />
                  <DocBtn label="Акт передачи в ТК" icon="FileCheck" url={d.act_pdf} />
                </>
              )}
              {isOwn && (
                <DocBtn label="Акт клиенту" icon="FileText" url={d.transfer_act_pdf} />
              )}
              <button
                onClick={() => window.open("https://kontur.ru/logistika", "_blank")}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                <Icon name="ExternalLink" size={12} />
                ЭТрН (Контур)
              </button>
              {d.tracking_number && (
                <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground">
                  <Icon name="Truck" size={12} />
                  {d.tracking_number}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status buttons */}
      {!["delivered", "refused"].includes(localStatus) && (
        <div className="border-t border-border px-5 py-4">
          {rejectMode ? (
            <div className="space-y-2 animate-fade-in">
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Укажите причину отказа..."
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => doStatus("refused", rejectReason)}
                  disabled={loading || !rejectReason.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-rose-500 disabled:opacity-40 transition-all active:scale-95">
                  {loading ? "..." : "Подтвердить отказ"}
                </button>
                <button onClick={() => setRejectMode(false)}
                  className="px-4 py-2.5 rounded-xl text-sm border border-border text-muted-foreground hover:text-foreground">
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {isOwn && (
                <>
                  {localStatus === "new" && (
                    <StatusBtn label="✅ Забрал у поставщика" onClick={() => doStatus("picked_from_supplier")} loading={loading} color="cyan" />
                  )}
                  {localStatus === "picked_from_supplier" && (
                    <StatusBtn label="🚗 В дороге" onClick={() => doStatus("in_transit")} loading={loading} color="amber" />
                  )}
                  {localStatus === "in_transit" && (
                    <StatusBtn label="🏠 Доставил" onClick={() => doStatus("delivered")} loading={loading} color="green" />
                  )}
                </>
              )}
              {isOzonPartner && localStatus !== "handed_to_tc" && (
                <StatusBtn label="📦 Сдал в ТК" onClick={() => doStatus("handed_to_tc")} loading={loading} color="violet" />
              )}
              {/* Refuse button — always available for non-final */}
              <button
                onClick={() => setRejectMode(true)}
                className="w-full py-2 rounded-xl text-sm font-medium border border-rose-400/30 text-rose-400 hover:bg-rose-400/10 transition-all">
                <Icon name="XCircle" size={14} className="inline mr-1.5" />
                Отказ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DocBtn({ label, icon, url }: { label: string; icon: string; url: string | null }) {
  if (!url) return (
    <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground opacity-40">
      <Icon name={icon} size={12} />{label}
    </span>
  );
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-foreground hover:border-ring transition-colors">
      <Icon name={icon} size={12} style={{ color: "hsl(var(--cyan))" }} />{label}
    </a>
  );
}

function StatusBtn({ label, onClick, loading, color }: { label: string; onClick: () => void; loading: boolean; color: string }) {
  const colors: Record<string, string> = {
    cyan:   "hsl(var(--cyan))",
    amber:  "hsl(var(--amber))",
    green:  "hsl(var(--green))",
    violet: "hsl(var(--violet))",
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all active:scale-95"
      style={{ background: colors[color], color: color === "amber" ? "#000" : "hsl(var(--primary-foreground))" }}>
      {loading ? <Icon name="Loader2" size={16} className="animate-spin inline" /> : label}
    </button>
  );
}

// ── Route section ──────────────────────────────────────────────────────────
function RouteSection({ logistId }: { logistId: string }) {
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    logistGet("route_points", logistId)
      .then(d => setPoints(d.points || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [logistId]);

  const mapUrl = points.length > 0
    ? `https://yandex.ru/maps/?mode=routes&rtt=auto&${points.map((p, i) => `rtext=${encodeURIComponent(p.address)}`).join("&")}`
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

// ── History section ────────────────────────────────────────────────────────
function HistorySection({ logistId }: { logistId: string }) {
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

// ── Main portal ────────────────────────────────────────────────────────────
export default function LogistPortal() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const logistId = user?.id || "";

  const [section, setSection] = useState<Section>("tasks");
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState("");

  const loadTasks = useCallback(() => {
    if (!logistId) return;
    setLoading(true);
    logistGet("today", logistId)
      .then(d => { setDeliveries(d.deliveries || []); setToday(d.today || ""); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [logistId]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  async function handleStatusChange(id: string, status: string, reason?: string) {
    await logistPost("status", logistId, { delivery_id: id, status, reject_reason: reason || "" });
    loadTasks();
  }

  const doneCount = deliveries.filter(d => ["delivered", "handed_to_tc", "refused"].includes(d.status)).length;

  const NAV = [
    { id: "tasks",   label: "Задания",  icon: "ClipboardList" },
    { id: "route",   label: "Маршрут",  icon: "Map" },
    { id: "history", label: "История",  icon: "History" },
  ] as const;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(var(--background))" }}>
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-border flex-shrink-0"
        style={{ background: "hsl(var(--card))" }}>
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: "hsl(var(--cyan))" }}>
              <span className="text-xs font-mono font-bold" style={{ color: "hsl(var(--primary-foreground))" }}>F</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground leading-none">FlowBox</div>
              <div className="text-[10px] text-muted-foreground">Логист</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs font-medium text-foreground">{user?.name || "Логист"}</div>
              {today && <div className="text-[10px] text-muted-foreground">{new Date(today).toLocaleDateString("ru", { day: "2-digit", month: "long" })}</div>}
            </div>
            <button onClick={async () => { await logout(); navigate("/login", { replace: true }); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Icon name="LogOut" size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-lg mx-auto px-4 py-5">

          {/* Tasks section */}
          {section === "tasks" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Задания на сегодня</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {deliveries.length} заданий · выполнено {doneCount}/{deliveries.length}
                  </p>
                </div>
                <button onClick={loadTasks} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <Icon name="RefreshCw" size={14} />
                </button>
              </div>

              {/* Progress bar */}
              {deliveries.length > 0 && (
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${(doneCount / deliveries.length) * 100}%`, background: "hsl(var(--green))" }} />
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-16">
                  <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
                </div>
              ) : deliveries.length === 0 ? (
                <div className="rounded-2xl border border-border p-10 text-center" style={{ background: "hsl(var(--card))" }}>
                  <Icon name="CheckCircle" size={32} className="mx-auto mb-3 text-green-400 opacity-60" />
                  <p className="text-sm font-medium text-foreground mb-1">Заданий нет</p>
                  <p className="text-xs text-muted-foreground">На сегодня заданий не назначено</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {deliveries.map(d => (
                    <DeliveryCard key={d.id} d={d} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              )}
            </div>
          )}

          {section === "route" && <RouteSection logistId={logistId} />}
          {section === "history" && <HistorySection logistId={logistId} />}
        </div>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 border-t border-border flex-shrink-0 z-10"
        style={{ background: "hsl(var(--card))" }}>
        <div className="max-w-lg mx-auto grid grid-cols-3">
          {NAV.map(item => (
            <button key={item.id} onClick={() => setSection(item.id)}
              className={`flex flex-col items-center gap-1 py-3 px-2 transition-colors relative ${
                section === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              {section === item.id && (
                <span className="absolute top-0 left-4 right-4 h-0.5 rounded-b"
                  style={{ background: "hsl(var(--cyan))" }} />
              )}
              <Icon name={item.icon} size={18} style={section === item.id ? { color: "hsl(var(--cyan))" } : {}} />
              <span className="text-[10px] font-medium">{item.label}</span>
              {item.id === "tasks" && doneCount > 0 && deliveries.length > 0 && (
                <span className="absolute top-2 right-5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={{ background: "hsl(var(--green))", color: "#fff" }}>
                  {doneCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
