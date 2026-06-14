import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Delivery, STATUS_LABELS, DELIVERY_TYPES, METHOD_LABELS } from "./LogistTypes";

// ── Status badge ────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] || { l: status, c: "text-muted-foreground", bg: "bg-secondary" };
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.c} ${s.bg}`}>{s.l}</span>;
}

// ── Doc button ──────────────────────────────────────────────────────────────
export function DocBtn({ label, icon, url }: { label: string; icon: string; url: string | null }) {
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

// ── Status action button ────────────────────────────────────────────────────
export function StatusBtn({ label, onClick, loading, color }: { label: string; onClick: () => void; loading: boolean; color: string }) {
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

// ── Delivery Card ───────────────────────────────────────────────────────────
export function DeliveryCard({ d, onStatusChange }: { d: Delivery; onStatusChange: (id: string, status: string, reason?: string) => Promise<void> }) {
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
