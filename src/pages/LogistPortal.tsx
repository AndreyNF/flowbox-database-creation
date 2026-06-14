import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, logout } from "@/lib/auth";
import { logistGet, logistPost } from "@/lib/logistApi";
import Icon from "@/components/ui/icon";
import { Section, Delivery } from "@/components/logist/LogistTypes";
import { DeliveryCard } from "@/components/logist/LogistDeliveryCard";
import { RouteSection, HistorySection } from "@/components/logist/LogistSections";

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
