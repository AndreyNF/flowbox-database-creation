import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, getHomeByRole } from "@/lib/auth";
import Icon from "@/components/ui/icon";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setError("Заполните все поля"); return; }
    setLoading(true);
    setError("");
    try {
      const user = await login(email.trim(), password);
      navigate(getHomeByRole(user.role), { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "hsl(var(--background))" }}>
      {/* Grid bg */}
      <div className="fixed inset-0 grid-bg opacity-30 pointer-events-none" />

      <div className="w-full max-w-sm relative animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-lg"
            style={{ background: "hsl(var(--cyan))" }}>
            <span className="text-base font-mono font-bold" style={{ color: "hsl(var(--primary-foreground))" }}>S</span>
          </div>
          <div>
            <div className="text-lg font-semibold text-foreground leading-none">SupplyOS</div>
            <div className="text-xs text-muted-foreground mt-0.5">Платформа управления поставками</div>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border p-8" style={{ background: "hsl(var(--card))" }}>
          <h1 className="text-base font-semibold text-foreground mb-1">Вход в систему</h1>
          <p className="text-xs text-muted-foreground mb-6">Введите данные вашего аккаунта</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email</label>
              <div className="relative">
                <Icon name="Mail" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(""); }}
                  placeholder="you@company.ru"
                  autoComplete="email"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Пароль</label>
              <div className="relative">
                <Icon name="Lock" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Icon name={showPw ? "EyeOff" : "Eye"} size={13} />
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-lg px-3 py-2.5 animate-fade-in">
                <Icon name="AlertCircle" size={13} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 mt-2"
              style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}
            >
              {loading
                ? <><Icon name="Loader2" size={15} className="animate-spin" /> Вхожу...</>
                : <><Icon name="LogIn" size={14} /> Войти</>
              }
            </button>
          </form>
        </div>

        {/* Role hints */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { role: "Admin", icon: "Shield", color: "var(--rose)", desc: "Полный доступ" },
            { role: "Manager", icon: "UserCog", color: "var(--cyan)", desc: "Операции" },
            { role: "Client", icon: "Building2", color: "var(--green)", desc: "Личный кабинет" },
          ].map(r => (
            <div key={r.role} className="rounded-lg border border-border p-3 text-center"
              style={{ background: "hsl(var(--card))" }}>
              <Icon name={r.icon} size={16} className="mx-auto mb-1" style={{ color: `hsl(${r.color})` }} />
              <div className="text-xs font-medium text-foreground">{r.role}</div>
              <div className="text-[10px] text-muted-foreground">{r.desc}</div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Нет доступа? Обратитесь к администратору системы.
        </p>
      </div>
    </div>
  );
}
