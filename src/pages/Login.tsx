import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { login, getHomeByRole } from "@/lib/auth";
import Icon from "@/components/ui/icon";

const SEED_URL = "https://functions.poehali.dev/f409d14d-e660-4b8b-b72b-3274ed088ba2";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Seed-режим
  const [needsSeed, setNeedsSeed] = useState<boolean | null>(null);
  const [seedMode, setSeedMode] = useState(false);
  const [seedSecret, setSeedSecret] = useState("");
  const [seedName, setSeedName] = useState("");
  const [seedEmail, setSeedEmail] = useState("");
  const [seedPassword, setSeedPassword] = useState("");
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState("");
  const [seedSuccess, setSeedSuccess] = useState(false);

  // Проверяем нужен ли seed при загрузке
  useEffect(() => {
    fetch(SEED_URL)
      .then(r => r.json())
      .then(d => {
        const parsed = typeof d === "string" ? JSON.parse(d) : d;
        setNeedsSeed(parsed.needs_seed === true);
        if (parsed.needs_seed) setSeedMode(true);
      })
      .catch(() => setNeedsSeed(false));
  }, []);

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

  async function handleSeed(e: React.FormEvent) {
    e.preventDefault();
    if (!seedSecret || !seedName || !seedEmail || !seedPassword) {
      setSeedError("Заполните все поля"); return;
    }
    if (seedPassword.length < 8) { setSeedError("Пароль минимум 8 символов"); return; }
    setSeedLoading(true);
    setSeedError("");
    try {
      const res = await fetch(SEED_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed_secret: seedSecret,
          name: seedName,
          email: seedEmail,
          password: seedPassword,
        }),
      });
      const raw = await res.text();
      const data = JSON.parse(raw);
      if (!res.ok) throw new Error(data.error || "Ошибка");
      setSeedSuccess(true);
      setNeedsSeed(false);
      setSeedMode(false);
      // Prefill login form
      setEmail(seedEmail);
    } catch (err: unknown) {
      setSeedError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSeedLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "hsl(var(--background))" }}>
      <div className="fixed inset-0 grid-bg opacity-30 pointer-events-none" />

      <div className="w-full max-w-sm relative animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-lg"
            style={{ background: "hsl(var(--cyan))" }}>
            <span className="text-base font-mono font-bold" style={{ color: "hsl(var(--primary-foreground))" }}>F</span>
          </div>
          <div>
            <div className="text-lg font-semibold text-foreground leading-none">FlowBox</div>
            <div className="text-xs text-muted-foreground mt-0.5">Платформа управления поставками</div>
          </div>
        </div>

        {/* Seed success banner */}
        {seedSuccess && (
          <div className="flex items-center gap-3 rounded-xl border border-green-400/30 bg-green-400/8 px-4 py-3 mb-5 animate-fade-in">
            <Icon name="CheckCircle" size={16} className="text-green-400 flex-shrink-0" />
            <div>
              <div className="text-xs font-medium text-green-400">Администратор создан!</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Email подставлен — введите пароль и войдите.</div>
            </div>
          </div>
        )}

        {/* SEED MODE */}
        {seedMode ? (
          <div className="rounded-2xl border border-amber-400/30 p-8 animate-fade-in"
            style={{ background: "hsl(var(--card))" }}>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "hsla(38,90%,52%,0.15)" }}>
                <Icon name="Shield" size={14} className="text-amber-400" />
              </div>
              <h1 className="text-base font-semibold text-foreground">Первый запуск</h1>
            </div>
            <p className="text-xs text-muted-foreground mb-6 ml-9">
              Администраторов нет. Создайте первый аккаунт.
            </p>

            <form onSubmit={handleSeed} className="space-y-3">
              {[
                { label: "Seed-ключ", value: seedSecret, set: setSeedSecret, type: "password", icon: "Key", ph: "Из секретов проекта" },
                { label: "Ваше имя", value: seedName, set: setSeedName, type: "text", icon: "User", ph: "Иванов Алексей" },
                { label: "Email", value: seedEmail, set: setSeedEmail, type: "email", icon: "Mail", ph: "admin@company.ru" },
                { label: "Пароль (мин. 8 символов)", value: seedPassword, set: setSeedPassword, type: "password", icon: "Lock", ph: "••••••••" },
              ].map(f => (
                <div key={f.label}>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{f.label}</label>
                  <div className="relative">
                    <Icon name={f.icon} size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type={f.type}
                      value={f.value}
                      onChange={e => { f.set(e.target.value); setSeedError(""); }}
                      placeholder={f.ph}
                      className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              ))}

              {seedError && (
                <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-lg px-3 py-2.5 animate-fade-in">
                  <Icon name="AlertCircle" size={13} />
                  {seedError}
                </div>
              )}

              <button
                type="submit"
                disabled={seedLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50 mt-1"
                style={{ background: "hsl(var(--amber))", color: "#000" }}
              >
                {seedLoading
                  ? <><Icon name="Loader2" size={15} className="animate-spin" /> Создаю...</>
                  : <><Icon name="UserPlus" size={14} /> Создать администратора</>
                }
              </button>

              <button
                type="button"
                onClick={() => setSeedMode(false)}
                className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors"
              >
                Уже есть аккаунт → войти
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* LOGIN FORM */}
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

            {needsSeed === false && (
              <button
                onClick={() => setSeedMode(true)}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-4 transition-colors"
              >
                Первый запуск? Создать администратора
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
