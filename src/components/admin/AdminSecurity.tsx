import { useEffect, useState } from "react";
import { adminGet, adminPost } from "@/lib/adminApi";
import { getCurrentUser } from "@/lib/auth";
import {
  Loader, ErrMsg, SectionHdr, Card, Th, Td, EmptyRow,
  StatusDot, PriBtn, fmtDateTime,
} from "./shared";
import Icon from "@/components/ui/icon";

type TabType = "logins" | "api";

interface LoginRow { id: string; email: string; name: string; ip: string; success: boolean; created_at: string; }
interface ApiRow   { id: string; company_name: string; endpoint: string; status_code: number; duration_ms: number; created_at: string; }
interface Anomaly  { company_id: string; count: number; minute: string; }

export default function AdminSecurity() {
  const [tab, setTab]         = useState<TabType>("logins");
  const [logins, setLogins]   = useState<LoginRow[]>([]);
  const [apiLog, setApiLog]   = useState<ApiRow[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutResult, setLogoutResult]   = useState<number | null>(null);
  const user = getCurrentUser();

  useEffect(() => {
    setLoading(true);
    adminGet("security")
      .then(d => {
        setLogins(d.login_log  || []);
        setApiLog(d.api_log    || []);
        setAnomalies(d.anomalies || []);
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function forceLogout() {
    if (!confirm("Принудительно выйти ВСЕХ пользователей? Это аварийная мера.")) return;
    setLogoutLoading(true);
    try {
      const res = await adminPost("force_logout", { admin_id: user?.id, reason: "manual" });
      setLogoutResult(res.count || 0);
    } catch(e:unknown) { setErr((e as Error).message); }
    finally { setLogoutLoading(false); }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <SectionHdr
        title="Безопасность"
        action={
          <button
            onClick={forceLogout}
            disabled={logoutLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-400/40 text-rose-400 hover:bg-rose-400/10 transition-all disabled:opacity-40"
          >
            {logoutLoading
              ? <Icon name="Loader2" size={12} className="animate-spin" />
              : <Icon name="LogOut" size={12} />}
            Принудительный выход всех
          </button>
        }
      />

      {err && <ErrMsg msg={err} />}

      {logoutResult !== null && (
        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-4 py-3 animate-fade-in">
          <Icon name="CheckCircle" size={13} />
          Выполнено — сессии сброшены для {logoutResult} пользователей.
        </div>
      )}

      {/* Аномалии */}
      {anomalies.length > 0 && (
        <div className="rounded-lg border border-rose-400/30 bg-rose-400/5 p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="AlertTriangle" size={15} className="text-rose-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-rose-400">Аномальная активность API</span>
          </div>
          <div className="space-y-2">
            {anomalies.map((a, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="font-mono text-rose-400 font-bold">{a.count} запр/мин</span>
                <span className="text-foreground">Client-Id: {a.company_id?.slice(0,8)}…</span>
                <span className="text-muted-foreground">{fmtDateTime(a.minute)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Табы */}
      <div className="flex gap-1 border-b border-border">
        {(["logins","api"] as TabType[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              tab === t ? "border-ring text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t === "logins" ? "Лог входов" : "Лог API"}
          </button>
        ))}
      </div>

      {loading ? <Loader /> : tab === "logins" ? (
        <Card>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <Th c="Дата" /><Th c="Email" /><Th c="Имя" /><Th c="IP" /><Th c="Результат" />
              </tr>
            </thead>
            <tbody>
              {logins.length === 0 && <EmptyRow cols={5} text="Нет записей" />}
              {logins.map(r => (
                <tr key={r.id}
                  className={`border-b border-border last:border-0 transition-colors ${!r.success ? "bg-rose-400/5 hover:bg-rose-400/10" : "hover:bg-secondary/30"}`}>
                  <Td c={fmtDateTime(r.created_at)} />
                  <Td mono c={r.email} />
                  <Td c={r.name || "—"} />
                  <Td mono c={r.ip || "—"} />
                  <Td c={
                    <div className="flex items-center gap-1.5">
                      <StatusDot ok={r.success} />
                      <span className={`text-xs ${r.success ? "text-green-400" : "text-rose-400"}`}>
                        {r.success ? "Успешно" : "Неудача"}
                      </span>
                    </div>
                  } />
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <Th c="Дата" /><Th c="Компания" /><Th c="Эндпоинт" /><Th c="Статус" /><Th c="Время, мс" />
              </tr>
            </thead>
            <tbody>
              {apiLog.length === 0 && <EmptyRow cols={5} text="Нет записей" />}
              {apiLog.map(r => (
                <tr key={r.id}
                  className={`border-b border-border last:border-0 transition-colors ${
                    r.status_code >= 400 ? "bg-rose-400/5 hover:bg-rose-400/10" : "hover:bg-secondary/30"
                  }`}>
                  <Td c={fmtDateTime(r.created_at)} />
                  <Td c={r.company_name || "—"} />
                  <Td mono c={<span className="text-[11px]">{r.endpoint}</span>} />
                  <Td c={
                    <span className={`font-mono text-xs font-semibold ${
                      !r.status_code         ? "text-muted-foreground" :
                      r.status_code < 300    ? "text-green-400" :
                      r.status_code < 400    ? "text-amber-400" :
                                               "text-rose-400"
                    }`}>
                      {r.status_code || "—"}
                    </span>
                  } />
                  <Td mono c={r.duration_ms ? `${r.duration_ms}` : "—"} />
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
