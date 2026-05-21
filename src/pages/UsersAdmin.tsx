import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAccessToken, logout, getCurrentUser, registerUser } from "@/lib/auth";
import Icon from "@/components/ui/icon";

const ROLE_LABELS: Record<string, string> = { admin: "Администратор", manager: "Менеджер", client: "Клиент" };
const ROLE_COLORS: Record<string, string> = {
  admin:   "text-rose-400 bg-rose-400/10",
  manager: "text-cyan-400 bg-cyan-400/10",
  client:  "text-green-400 bg-green-400/10",
};

export default function UsersAdmin() {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "manager" as const, company_id: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) { setError("Заполните все обязательные поля"); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      const token = getAccessToken();
      if (!token) { navigate("/login"); return; }
      await registerUser(token, { ...form, company_id: form.company_id || undefined });
      setSuccess(`Пользователь ${form.email} создан`);
      setForm({ name: "", email: "", password: "", role: "manager", company_id: "" });
      setShowForm(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen p-8" style={{ background: "hsl(var(--background))" }}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: "hsl(var(--cyan))" }}>
              <span className="text-xs font-mono font-bold" style={{ color: "hsl(var(--primary-foreground))" }}>S</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">SupplyOS</div>
              <div className="text-xs text-muted-foreground">Управление пользователями</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs font-medium text-foreground">{user?.name}</div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ROLE_COLORS[user?.role || "admin"]}`}>
                {ROLE_LABELS[user?.role || "admin"]}
              </span>
            </div>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border">
              <Icon name="LogOut" size={13} /> Выйти
            </button>
          </div>
        </div>

        {/* Nav links */}
        <div className="flex gap-3 mb-6">
          {[
            { href: "/", label: "Дашборд", icon: "LayoutDashboard" },
            { href: "/manager", label: "Менеджер", icon: "UserCog" },
          ].map(l => (
            <button key={l.href} onClick={() => navigate(l.href)}
              className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
              <Icon name={l.icon} size={13} /> {l.label}
            </button>
          ))}
        </div>

        {success && (
          <div className="flex items-center gap-2 text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-4 py-3 mb-4 animate-fade-in">
            <Icon name="CheckCircle" size={13} /> {success}
          </div>
        )}

        {/* Card */}
        <div className="rounded-xl border border-border" style={{ background: "hsl(var(--card))" }}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <div className="text-sm font-semibold text-foreground">Пользователи системы</div>
              <div className="text-xs text-muted-foreground">Создание аккаунтов и назначение ролей</div>
            </div>
            <button onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-medium transition-all hover:opacity-90"
              style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
              <Icon name={showForm ? "X" : "UserPlus"} size={13} />
              {showForm ? "Отмена" : "Создать пользователя"}
            </button>
          </div>

          {/* Create form */}
          {showForm && (
            <form onSubmit={handleCreate} className="px-6 py-5 border-b border-border animate-fade-in"
              style={{ background: "hsla(195,90%,48%,0.03)" }}>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Новый пользователь</div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Имя *", key: "name", type: "text", placeholder: "Иванов Алексей" },
                  { label: "Email *", key: "email", type: "email", placeholder: "user@company.ru" },
                  { label: "Пароль *", key: "password", type: "password", placeholder: "Минимум 8 символов" },
                  { label: "ID компании (для клиента)", key: "company_id", type: "text", placeholder: "UUID компании" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs text-muted-foreground mb-1.5 block">{f.label}</label>
                    <input type={f.type} value={form[f.key as keyof typeof form] as string}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Роль *</label>
                  <div className="flex gap-2">
                    {(["admin", "manager", "client"] as const).map(r => (
                      <button key={r} type="button" onClick={() => setForm(p => ({ ...p, role: r }))}
                        className={`flex-1 py-2 text-xs rounded-lg border font-medium transition-all ${form.role === r ? "border-ring text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                        style={form.role === r ? { background: "hsla(195,90%,48%,0.1)" } : {}}>
                        {ROLE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-rose-400 mt-3 bg-rose-400/10 rounded-lg px-3 py-2">
                  <Icon name="AlertCircle" size={12} /> {error}
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <button type="submit" disabled={loading}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium disabled:opacity-40"
                  style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
                  {loading ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="UserPlus" size={13} />}
                  Создать
                </button>
                <button type="button" onClick={() => { setShowForm(false); setError(""); }}
                  className="px-5 py-2 rounded-lg text-xs border border-border text-muted-foreground hover:text-foreground">
                  Отмена
                </button>
              </div>
            </form>
          )}

          {/* Role guide */}
          <div className="p-6">
            <div className="text-xs font-medium text-muted-foreground mb-4">Права доступа по ролям</div>
            <div className="space-y-3">
              {[
                {
                  role: "admin",
                  label: "Администратор",
                  perms: ["Полный доступ ко всем разделам", "Управление пользователями и ролями", "Финансовые операции", "Настройки платформы"],
                  route: "/",
                },
                {
                  role: "manager",
                  label: "Менеджер",
                  perms: ["Все клиенты и заказы", "Каталог и поставщики", "Рекламации и финансы", "Логистика и поддержка"],
                  route: "/manager",
                },
                {
                  role: "client",
                  label: "Клиент",
                  perms: ["Только свои данные", "Каталог и заказы", "Свои счета и рекламации", "Чат с менеджером"],
                  route: "/client",
                },
              ].map(r => (
                <div key={r.role} className="flex items-start gap-4 p-4 rounded-lg border border-border"
                  style={{ background: "hsl(var(--secondary))" }}>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${ROLE_COLORS[r.role]}`}>
                    {r.label}
                  </span>
                  <div className="flex-1 flex flex-wrap gap-2">
                    {r.perms.map(p => (
                      <span key={p} className="text-[10px] px-2 py-0.5 rounded bg-card text-muted-foreground flex items-center gap-1">
                        <Icon name="Check" size={9} /> {p}
                      </span>
                    ))}
                  </div>
                  <button onClick={() => navigate(r.route)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground flex-shrink-0 transition-colors">
                    Открыть <Icon name="ArrowRight" size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
