import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { login, getHomeByRole } from "@/lib/auth";
import Icon from "@/components/ui/icon";

const SEED_URL  = "https://functions.poehali.dev/f409d14d-e660-4b8b-b72b-3274ed088ba2";
const RESET_URL = "https://functions.poehali.dev/254ed7fd-dae1-4f80-b420-43ecb70c3265";

type View = "login" | "seed" | "forgot" | "reset_new";

function FieldInput({ label, value, onChange, type = "text", icon, placeholder, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; icon: string; placeholder?: string; autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const isPw = type === "password";
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</label>
      <div className="relative">
        <Icon name={icon} size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type={isPw ? (show ? "text" : "password") : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
        />
        {isPw && (
          <button type="button" onClick={() => setShow(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <Icon name={show ? "EyeOff" : "Eye"} size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-lg px-3 py-2.5 animate-fade-in">
      <Icon name="AlertCircle" size={13} />{msg}
    </div>
  );
}

function OkBox({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2.5 animate-fade-in">
      <Icon name="CheckCircle" size={13} />{msg}
    </div>
  );
}

function Btn({ loading, label, loadingLabel, accent }: {
  loading: boolean; label: string; loadingLabel?: string; accent?: string;
}) {
  return (
    <button type="submit" disabled={loading}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
      style={{ background: accent || "hsl(var(--cyan))", color: accent ? "#000" : "hsl(var(--primary-foreground))" }}>
      {loading
        ? <><Icon name="Loader2" size={15} className="animate-spin" />{loadingLabel || "Загрузка..."}</>
        : label}
    </button>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlToken = searchParams.get("reset_token") || "";

  const [view, setView] = useState<View>(urlToken ? "reset_new" : "login");

  // login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginSuccess, setLoginSuccess] = useState("");

  // forgot
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  // reset
  const [resetToken, setResetToken] = useState(urlToken);
  const [resetEmail, setResetEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetDone, setResetDone] = useState(false);

  // seed
  const [needsSeed, setNeedsSeed] = useState(false);
  const [seedSecret, setSeedSecret] = useState("");
  const [seedName, setSeedName] = useState("");
  const [seedEmail, setSeedEmail] = useState("");
  const [seedPw, setSeedPw] = useState("");
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedError, setSeedError] = useState("");
  const [seedDone, setSeedDone] = useState(false);

  // Check seed on mount
  useEffect(() => {
    fetch(SEED_URL).then(r => r.json()).then(d => {
      const p = typeof d === "string" ? JSON.parse(d) : d;
      if (p.needs_seed) { setNeedsSeed(true); setView("seed"); }
    }).catch(() => {});
  }, []);

  // Verify URL token on mount
  useEffect(() => {
    if (!urlToken) return;
    fetch(RESET_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", token: urlToken }),
    }).then(r => r.json()).then(d => {
      const p = typeof d === "string" ? JSON.parse(d) : d;
      if (p.email) setResetEmail(p.email);
      else setResetError(p.error || "Токен недействителен");
    }).catch(() => setResetError("Не удалось проверить токен"));
  }, [urlToken]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setLoginError("Заполните все поля"); return; }
    setLoginLoading(true); setLoginError("");
    try {
      const user = await login(email.trim(), password);
      navigate(getHomeByRole(user.role), { replace: true });
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : "Ошибка входа");
    } finally { setLoginLoading(false); }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotEmail.trim()) { setForgotError("Введите email"); return; }
    setForgotLoading(true); setForgotError("");
    try {
      const res = await fetch(RESET_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", email: forgotEmail.trim() }),
      });
      const d = JSON.parse(await res.text());
      if (!res.ok) throw new Error(d.error || "Ошибка");
      setForgotSent(true);
    } catch (err: unknown) {
      setForgotError(err instanceof Error ? err.message : "Ошибка");
    } finally { setForgotLoading(false); }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 8) { setResetError("Минимум 8 символов"); return; }
    if (newPw !== newPw2) { setResetError("Пароли не совпадают"); return; }
    setResetLoading(true); setResetError("");
    try {
      const res = await fetch(RESET_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", token: resetToken, new_password: newPw }),
      });
      const d = JSON.parse(await res.text());
      if (!res.ok) throw new Error(d.error || "Ошибка");
      setResetDone(true);
      setEmail(d.email || "");
      setLoginSuccess("Пароль изменён! Войдите с новым паролем.");
      setSearchParams({});
      setTimeout(() => setView("login"), 2000);
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : "Ошибка");
    } finally { setResetLoading(false); }
  }

  async function handleSeed(e: React.FormEvent) {
    e.preventDefault();
    if (!seedSecret || !seedName || !seedEmail || !seedPw) { setSeedError("Заполните все поля"); return; }
    if (seedPw.length < 8) { setSeedError("Пароль минимум 8 символов"); return; }
    setSeedLoading(true); setSeedError("");
    try {
      const res = await fetch(SEED_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed_secret: seedSecret, name: seedName, email: seedEmail, password: seedPw }),
      });
      const d = JSON.parse(await res.text());
      if (!res.ok) throw new Error(d.error || "Ошибка");
      setSeedDone(true);
      setEmail(seedEmail);
      setLoginSuccess("Администратор создан! Введите пароль и войдите.");
      setNeedsSeed(false);
      setTimeout(() => setView("login"), 2000);
    } catch (err: unknown) {
      setSeedError(err instanceof Error ? err.message : "Ошибка");
    } finally { setSeedLoading(false); }
  }

  // Password strength indicator
  const pwStrength = [
    newPw.length >= 8,
    /[A-Z]/.test(newPw) || /[А-Я]/.test(newPw),
    /[0-9]/.test(newPw),
    /[^a-zA-Zа-яА-Я0-9]/.test(newPw),
  ];
  const pwHint = newPw.length === 0 ? "" : newPw.length < 8 ? "Слишком короткий" : !pwStrength[2] ? "Добавьте цифру" : !pwStrength[1] ? "Добавьте заглавную букву" : "Надёжный пароль ✓";

  const BackBtn = ({ label, target }: { label: string; target: View }) => (
    <button onClick={() => setView(target)}
      className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-4 w-full transition-colors">
      <Icon name="ArrowLeft" size={12} />{label}
    </button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "hsl(var(--background))" }}>
      <div className="fixed inset-0 grid-bg opacity-30 pointer-events-none" />

      <div className="w-full max-w-sm relative animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shadow-lg" style={{ background: "hsl(var(--cyan))" }}>
            <span className="text-base font-mono font-bold" style={{ color: "hsl(var(--primary-foreground))" }}>F</span>
          </div>
          <div>
            <div className="text-lg font-semibold text-foreground leading-none">FlowBox</div>
            <div className="text-xs text-muted-foreground mt-0.5">Платформа управления поставками</div>
          </div>
        </div>

        {/* ── SEED ── */}
        {view === "seed" && (
          <div className="rounded-2xl border border-amber-400/30 p-8" style={{ background: "hsl(var(--card))" }}>
            {seedDone ? <OkBox msg="Администратор создан! Переходим ко входу..." /> : (
              <>
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "hsla(38,90%,52%,0.15)" }}>
                    <Icon name="Shield" size={14} className="text-amber-400" />
                  </div>
                  <h1 className="text-base font-semibold text-foreground">Первый запуск</h1>
                </div>
                <p className="text-xs text-muted-foreground mb-5 ml-9">Создайте аккаунт администратора</p>
                <form onSubmit={handleSeed} className="space-y-3">
                  <FieldInput label="Seed-ключ" value={seedSecret} onChange={v=>{setSeedSecret(v);setSeedError("");}} type="password" icon="Key" placeholder="Из секретов проекта" />
                  <FieldInput label="Ваше имя" value={seedName} onChange={v=>{setSeedName(v);setSeedError("");}} icon="User" placeholder="Иванов Алексей" />
                  <FieldInput label="Email" value={seedEmail} onChange={v=>{setSeedEmail(v);setSeedError("");}} type="email" icon="Mail" placeholder="admin@company.ru" />
                  <FieldInput label="Пароль (мин. 8 символов)" value={seedPw} onChange={v=>{setSeedPw(v);setSeedError("");}} type="password" icon="Lock" placeholder="••••••••" />
                  {seedError && <ErrBox msg={seedError} />}
                  <Btn loading={seedLoading} label="Создать администратора" loadingLabel="Создаю..." accent="hsl(var(--amber))" />
                  <button type="button" onClick={()=>setView("login")} className="w-full text-xs text-muted-foreground hover:text-foreground py-1 transition-colors">Уже есть аккаунт → войти</button>
                </form>
              </>
            )}
          </div>
        )}

        {/* ── LOGIN ── */}
        {view === "login" && (
          <>
            {loginSuccess && <div className="mb-4"><OkBox msg={loginSuccess} /></div>}
            <div className="rounded-2xl border border-border p-8" style={{ background: "hsl(var(--card))" }}>
              <h1 className="text-base font-semibold text-foreground mb-1">Вход в систему</h1>
              <p className="text-xs text-muted-foreground mb-6">Введите данные вашего аккаунта</p>
              <form onSubmit={handleLogin} className="space-y-4">
                <FieldInput label="Email" value={email} onChange={v=>{setEmail(v);setLoginError("");}} type="email" icon="Mail" placeholder="you@company.ru" autoComplete="email" />
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Пароль</label>
                    <button type="button" onClick={()=>{setForgotEmail(email);setForgotSent(false);setForgotError("");setView("forgot");}}
                      className="text-xs transition-colors hover:opacity-80" style={{ color: "hsl(var(--cyan))" }}>
                      Забыли пароль?
                    </button>
                  </div>
                  <div className="relative">
                    <Icon name="Lock" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type="password" value={password} onChange={e=>{setPassword(e.target.value);setLoginError("");}}
                      placeholder="••••••••" autoComplete="current-password"
                      className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors" />
                  </div>
                </div>
                {loginError && <ErrBox msg={loginError} />}
                <Btn loading={loginLoading} label="→ Войти" loadingLabel="Вхожу..." />
              </form>
            </div>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {[
                { role: "Admin", icon: "Shield", color: "var(--rose)", desc: "Полный доступ" },
                { role: "Manager", icon: "UserCog", color: "var(--cyan)", desc: "Операции" },
                { role: "Client", icon: "Building2", color: "var(--green)", desc: "Личный кабинет" },
              ].map(r => (
                <div key={r.role} className="rounded-lg border border-border p-3 text-center" style={{ background: "hsl(var(--card))" }}>
                  <Icon name={r.icon} size={16} className="mx-auto mb-1" style={{ color: `hsl(${r.color})` }} />
                  <div className="text-xs font-medium text-foreground">{r.role}</div>
                  <div className="text-[10px] text-muted-foreground">{r.desc}</div>
                </div>
              ))}
            </div>
            <button onClick={()=>setView("seed")}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-4 transition-colors">
              Первый запуск? Создать администратора
            </button>
          </>
        )}

        {/* ── FORGOT ── */}
        {view === "forgot" && (
          <div className="rounded-2xl border border-border p-8 animate-fade-in" style={{ background: "hsl(var(--card))" }}>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "hsla(195,90%,48%,0.12)" }}>
                <Icon name="Mail" size={14} style={{ color: "hsl(var(--cyan))" }} />
              </div>
              <h1 className="text-base font-semibold text-foreground">Сброс пароля</h1>
            </div>
            <p className="text-xs text-muted-foreground mb-6 ml-9">Отправим ссылку на вашу почту</p>
            {forgotSent ? (
              <div className="space-y-4">
                <OkBox msg="Письмо отправлено! Проверьте почту." />
                <p className="text-xs text-muted-foreground text-center leading-relaxed">Ссылка действительна <strong className="text-foreground">1 час</strong>.<br />Не пришло — проверьте папку «Спам».</p>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <FieldInput label="Email аккаунта" value={forgotEmail} onChange={v=>{setForgotEmail(v);setForgotError("");}} type="email" icon="Mail" placeholder="you@company.ru" autoComplete="email" />
                {forgotError && <ErrBox msg={forgotError} />}
                <Btn loading={forgotLoading} label="Отправить ссылку" loadingLabel="Отправляю..." />
              </form>
            )}
            <BackBtn label="Вернуться ко входу" target="login" />
          </div>
        )}

        {/* ── NEW PASSWORD ── */}
        {view === "reset_new" && (
          <div className="rounded-2xl border border-border p-8 animate-fade-in" style={{ background: "hsl(var(--card))" }}>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "hsla(145,60%,42%,0.12)" }}>
                <Icon name="KeyRound" size={14} className="text-green-400" />
              </div>
              <h1 className="text-base font-semibold text-foreground">Новый пароль</h1>
            </div>
            {resetEmail && <p className="text-xs text-muted-foreground mb-5 ml-9">Аккаунт: <span className="text-foreground font-medium">{resetEmail}</span></p>}
            {resetDone ? (
              <OkBox msg="Пароль изменён! Переходим ко входу..." />
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                {!urlToken && (
                  <FieldInput label="Токен из письма" value={resetToken} onChange={v=>{setResetToken(v);setResetError("");}} icon="Key" placeholder="Вставьте токен" />
                )}
                <FieldInput label="Новый пароль" value={newPw} onChange={v=>{setNewPw(v);setResetError("");}} type="password" icon="Lock" placeholder="Минимум 8 символов" autoComplete="new-password" />
                <FieldInput label="Повторите пароль" value={newPw2} onChange={v=>{setNewPw2(v);setResetError("");}} type="password" icon="Lock" placeholder="Повторите пароль" autoComplete="new-password" />

                {newPw.length > 0 && (
                  <div>
                    <div className="flex gap-1 mb-1">
                      {pwStrength.map((ok, i) => (
                        <div key={i} className="flex-1 h-1 rounded-full transition-all duration-300"
                          style={{ background: ok ? "hsl(var(--green))" : "hsl(var(--border))" }} />
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{pwHint}</p>
                  </div>
                )}

                {resetError && <ErrBox msg={resetError} />}
                <Btn loading={resetLoading} label="Установить пароль" loadingLabel="Сохраняю..." />
              </form>
            )}
            <BackBtn label="Вернуться ко входу" target="login" />
          </div>
        )}
      </div>
    </div>
  );
}
