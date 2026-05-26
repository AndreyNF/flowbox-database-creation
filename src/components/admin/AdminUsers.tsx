import { useEffect, useState, useCallback } from "react";
import { adminGet, adminPost } from "@/lib/adminApi";
import {
  Loader, ErrMsg, SectionHdr, Card, Th, Td, EmptyRow,
  RoleBadge, StatusDot, Overlay, PriBtn, SecBtn, fmtDate, fmtDateTime,
} from "./shared";
import Icon from "@/components/ui/icon";

const ROLES = ["admin","manager","client","logist","product_manager"];
const ROLE_LABELS: Record<string,string> = {
  admin:"Админ", manager:"Менеджер", client:"Клиент",
  logist:"Логист", product_manager:"Прод. менеджер",
};

interface User {
  id: string; name: string; email: string; role: string; phone: string;
  is_active: boolean; created_at: string; last_login_at: string;
  access_expires_at: string; blocked_at: string; company_name: string;
}

export default function AdminUsers() {
  const [users, setUsers]     = useState<User[]>([]);
  const [companies, setCompanies] = useState<{id:string;name:string}[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [roleF, setRoleF]     = useState("");
  const [search, setSearch]   = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [tempPw, setTempPw]   = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm]       = useState({ name:"", email:"", phone:"", role:"manager", company_id:"", access_expires_at:"" });

  const [actionLoading, setActionLoading] = useState<string>("");

  const load = useCallback(() => {
    setLoading(true);
    const extra: Record<string,string> = {};
    if (roleF)  extra.role   = roleF;
    if (search) extra.search = search;
    adminGet("users", extra)
      .then(d => { setUsers(d.users || []); setTotal(d.total || 0); setCompanies(d.companies || []); })
      .catch((e:Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [roleF, search]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string, userId: string, extra: Record<string,unknown> = {}) {
    setActionLoading(userId + action);
    setErr("");
    try {
      const res = await adminPost("users_action", { action, user_id: userId, ...extra });
      if (res.temp_password) setTempPw(res.temp_password);
      load();
    } catch(e:unknown) { setErr((e as Error).message); }
    finally { setActionLoading(""); }
  }

  async function createUser() {
    setCreating(true);
    setErr("");
    try {
      const res = await adminPost("users_action", { action: "create", ...form });
      setTempPw(res.temp_password || "");
      setShowCreate(false);
      setForm({ name:"", email:"", phone:"", role:"manager", company_id:"", access_expires_at:"" });
      load();
    } catch(e:unknown) { setErr((e as Error).message); }
    finally { setCreating(false); }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <SectionHdr
        title="Пользователи"
        sub={`Всего: ${total}`}
        action={<PriBtn onClick={() => setShowCreate(true)} label="Добавить" icon="UserPlus" />}
      />
      {err && <ErrMsg msg={err} />}

      {/* Фильтры */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative">
          <Icon name="Search" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по имени / email..."
            className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-56"
          />
        </div>
        <select value={roleF} onChange={e => setRoleF(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none">
          <option value="">Все роли</option>
          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </div>

      {/* Таблица */}
      {loading ? <Loader /> : (
        <Card>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <Th c="Имя / Email" /><Th c="Роль" /><Th c="Компания" /><Th c="Статус" /><Th c="Последний вход" /><Th c="Действия" />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && <EmptyRow cols={6} />}
              {users.map(u => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                  <Td c={
                    <div>
                      <div className="font-medium text-foreground">{u.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{u.email}</div>
                      {u.phone && <div className="text-[10px] text-muted-foreground">{u.phone}</div>}
                    </div>
                  } />
                  <Td c={<RoleBadge role={u.role} />} />
                  <Td c={u.company_name || "—"} />
                  <Td c={
                    <div className="flex items-center gap-1.5">
                      <StatusDot ok={u.is_active} />
                      <span className={`text-xs ${u.is_active ? "text-green-400" : "text-rose-400"}`}>
                        {u.is_active ? "Активен" : "Заблокирован"}
                      </span>
                    </div>
                  } />
                  <Td c={fmtDateTime(u.last_login_at)} />
                  <Td c={
                    <div className="flex gap-1 flex-wrap">
                      {u.is_active ? (
                        <button onClick={() => doAction("block", u.id)}
                          disabled={actionLoading === u.id+"block"}
                          className="px-2 py-1 text-[11px] rounded border border-rose-400/30 text-rose-400 hover:bg-rose-400/10 transition-all disabled:opacity-40">
                          Блок
                        </button>
                      ) : (
                        <button onClick={() => doAction("unblock", u.id)}
                          disabled={actionLoading === u.id+"unblock"}
                          className="px-2 py-1 text-[11px] rounded border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-all disabled:opacity-40">
                          Разблок
                        </button>
                      )}
                      <button onClick={() => doAction("reset_password", u.id)}
                        disabled={actionLoading === u.id+"reset_password"}
                        className="px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-foreground transition-all disabled:opacity-40">
                        Сброс пароля
                      </button>
                      <button onClick={() => { if (confirm(`Удалить ${u.name}?`)) doAction("delete", u.id); }}
                        className="px-2 py-1 text-[11px] rounded border border-rose-400/20 text-rose-400/60 hover:text-rose-400 hover:border-rose-400/40 transition-all">
                        Удалить
                      </button>
                    </div>
                  } />
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Модалка создания */}
      {showCreate && (
        <Overlay onClose={() => setShowCreate(false)}>
          <div className="p-6">
            <div className="text-sm font-semibold text-foreground mb-5">Новый пользователь</div>
            <div className="space-y-3">
              {[
                { key:"name",  label:"Полное имя *",   type:"text",  ph:"Иван Иванов" },
                { key:"email", label:"Email *",         type:"email", ph:"ivan@example.com" },
                { key:"phone", label:"Телефон",         type:"tel",   ph:"+7 900 000-00-00" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-muted-foreground mb-1 block">{f.label}</label>
                  <input type={f.type} value={(form as Record<string,string>)[f.key]}
                    onChange={e => setForm(v => ({...v, [f.key]: e.target.value}))}
                    placeholder={f.ph}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                </div>
              ))}
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Роль *</label>
                <select value={form.role} onChange={e => setForm(v => ({...v, role: e.target.value}))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none">
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              {form.role === "client" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Компания</label>
                  <select value={form.company_id} onChange={e => setForm(v => ({...v, company_id: e.target.value}))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none">
                    <option value="">— Выберите —</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              {form.role === "product_manager" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Дата истечения доступа</label>
                  <input type="date" value={form.access_expires_at}
                    onChange={e => setForm(v => ({...v, access_expires_at: e.target.value}))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-secondary text-foreground focus:outline-none" />
                </div>
              )}
            </div>
            {err && <div className="mt-3 text-xs text-rose-400">{err}</div>}
            <div className="flex gap-2 mt-5">
              <PriBtn onClick={createUser} label="Создать" icon="UserPlus" loading={creating} disabled={!form.name || !form.email} />
              <SecBtn onClick={() => setShowCreate(false)} label="Отмена" />
            </div>
          </div>
        </Overlay>
      )}

      {/* Временный пароль */}
      {tempPw && (
        <Overlay onClose={() => setTempPw("")}>
          <div className="p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-green-400/10 flex items-center justify-center mx-auto mb-4">
              <Icon name="KeyRound" size={22} className="text-green-400" />
            </div>
            <div className="text-sm font-semibold text-foreground mb-2">Временный пароль</div>
            <p className="text-xs text-muted-foreground mb-4">Сообщите пользователю этот пароль. После входа он сможет его изменить.</p>
            <div className="font-mono text-lg font-bold tracking-widest text-foreground bg-secondary rounded-lg py-3 px-4 mb-5 select-all">
              {tempPw}
            </div>
            <PriBtn onClick={() => setTempPw("")} label="Закрыть" />
          </div>
        </Overlay>
      )}
    </div>
  );
}
