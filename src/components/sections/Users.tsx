import { useState } from "react";
import Icon from "@/components/ui/icon";

const USERS = [
  { id: 1, name: "Иванов Алексей", email: "ivanov@flowbox.ru", role: "Администратор", companies: 3, lastLogin: "21.05.2026 09:41", status: "Онлайн" },
  { id: 2, name: "Петрова Мария", email: "petrova@flowbox.ru", role: "Менеджер", companies: 2, lastLogin: "21.05.2026 08:15", status: "Онлайн" },
  { id: 3, name: "Кузнецов Павел", email: "kuznetsov@flowbox.ru", role: "Менеджер", companies: 1, lastLogin: "20.05.2026 18:30", status: "Офлайн" },
  { id: 4, name: "Смирнова Елена", email: "smirnova@flowbox.ru", role: "Аналитик", companies: 0, lastLogin: "21.05.2026 09:00", status: "Онлайн" },
  { id: 5, name: "Новиков Дмитрий", email: "novikov@flowbox.ru", role: "Оператор", companies: 1, lastLogin: "19.05.2026 14:22", status: "Офлайн" },
  { id: 6, name: "Козлова Анна", email: "kozlova@flowbox.ru", role: "Финансовый директор", companies: 0, lastLogin: "21.05.2026 07:55", status: "Онлайн" },
];

const ROLES = [
  { name: "Администратор", color: "text-rose-400 bg-rose-400/10", perms: ["Полный доступ", "Управление пользователями", "Финансы", "API"] },
  { name: "Менеджер", color: "text-cyan-400 bg-cyan-400/10", perms: ["Компании", "Заказы", "Поставщики"] },
  { name: "Аналитик", color: "text-violet-400 bg-violet-400/10", perms: ["Дашборд (чтение)", "Отчёты"] },
  { name: "Оператор", color: "text-amber-400 bg-amber-400/10", perms: ["Заказы (просмотр)", "Доставка"] },
  { name: "Финансовый директор", color: "text-green-400 bg-green-400/10", perms: ["Финансы", "Отчёты", "Лимиты"] },
];

const ROLE_COLORS: Record<string, string> = Object.fromEntries(ROLES.map(r => [r.name, r.color]));

export default function Users() {
  const [tab, setTab] = useState<"users" | "roles">("users");

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Пользователи и роли</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{USERS.length} пользователей · {USERS.filter(u => u.status === "Онлайн").length} онлайн</p>
        </div>
        <button className="flex items-center gap-2 text-xs px-3 py-1.5 rounded font-medium"
          style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
          <Icon name="UserPlus" size={13} />
          Пригласить
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-border">
        {(["users", "roles"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-xs font-medium transition-colors relative ${
              tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t === "users" ? "Пользователи" : "Роли и права"}
            {tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" style={{ background: "hsl(var(--cyan))" }} />}
          </button>
        ))}
      </div>

      {tab === "users" ? (
        <div className="rounded-lg border border-border overflow-hidden" style={{ background: "hsl(var(--card))" }}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["Сотрудник", "Роль", "Компании", "Последний вход", "Статус", ""].map(h => (
                  <th key={h} className="text-left text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-5 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {USERS.map(u => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-medium text-foreground flex-shrink-0">
                        {u.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-foreground">{u.name}</div>
                        <div className="text-[10px] text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] || "text-muted-foreground bg-secondary"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{u.companies || "—"}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{u.lastLogin}</td>
                  <td className="px-5 py-3">
                    <span className={`flex items-center gap-1 text-xs ${u.status === "Онлайн" ? "text-green-400" : "text-muted-foreground"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full inline-block ${u.status === "Онлайн" ? "bg-green-400" : "bg-muted-foreground"}`} />
                      {u.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button className="text-muted-foreground hover:text-foreground transition-colors">
                      <Icon name="MoreHorizontal" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {ROLES.map(r => (
            <div key={r.name} className="rounded-lg border border-border p-5 flex items-center gap-5"
              style={{ background: "hsl(var(--card))" }}>
              <div className="w-32 flex-shrink-0">
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${r.color}`}>{r.name}</span>
              </div>
              <div className="flex-1 flex flex-wrap gap-2">
                {r.perms.map(p => (
                  <span key={p} className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground flex items-center gap-1">
                    <Icon name="Check" size={9} /> {p}
                  </span>
                ))}
              </div>
              <div className="text-xs text-muted-foreground flex-shrink-0">
                {USERS.filter(u => u.role === r.name).length} чел.
              </div>
              <button className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground flex-shrink-0">
                Настроить
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}