import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout, getCurrentUser } from "@/lib/auth";
import Icon from "@/components/ui/icon";
import AdminOverview  from "@/components/admin/AdminOverview";
import AdminUsers     from "@/components/admin/AdminUsers";
import AdminSettings  from "@/components/admin/AdminSettings";
import AdminBank      from "@/components/admin/AdminBank";
import AdminTariffs   from "@/components/admin/AdminTariffs";
import AdminZones     from "@/components/admin/AdminZones";
import AdminArchive   from "@/components/admin/AdminArchive";
import AdminSecurity  from "@/components/admin/AdminSecurity";
import MgrClients     from "@/components/manager/sections/MgrClients";
import MgrCatalog     from "@/components/manager/sections/MgrCatalog";
import AdminCreateClient from "@/components/admin/AdminCreateClient";

type Section =
  | "overview" | "users" | "settings" | "bank" | "tariffs"
  | "zones" | "archive" | "security"
  | "clients" | "catalog" | "create_client";

const NAV: { id: Section; label: string; icon: string; group: string }[] = [
  { id: "overview",       label: "Обзор",              icon: "LayoutDashboard", group: "Главная" },
  { id: "clients",        label: "Клиенты",             icon: "Building2",       group: "Управление" },
  { id: "create_client",  label: "Создать клиента",     icon: "UserPlus",        group: "Управление" },
  { id: "catalog",        label: "Каталог товаров",     icon: "Package",         group: "Управление" },
  { id: "users",          label: "Пользователи",        icon: "Users",           group: "Управление" },
  { id: "settings",       label: "Настройки",           icon: "Settings",        group: "Управление" },
  { id: "bank",           label: "Банк",                icon: "Banknote",        group: "Финансы" },
  { id: "tariffs",        label: "Тарифы",              icon: "Percent",         group: "Финансы" },
  { id: "zones",          label: "Зоны доставки",       icon: "MapPin",          group: "Логистика" },
  { id: "archive",        label: "Архив",               icon: "Archive",         group: "Данные" },
  { id: "security",       label: "Безопасность",        icon: "Shield",          group: "Данные" },
];

const SECTION_LABELS: Record<Section, string> = {
  overview: "Обзор", users: "Пользователи", settings: "Настройки",
  bank: "Банк", tariffs: "Тарифы", zones: "Зоны доставки",
  archive: "Архив", security: "Безопасность",
  clients: "Клиенты", catalog: "Каталог товаров", create_client: "Создать клиента",
};

export default function AdminPortal() {
  const [active, setActive]       = useState<Section>("overview");
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const user = getCurrentUser();

  const groups = NAV.reduce<Record<string, typeof NAV>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "hsl(var(--background))" }}>

      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border transition-all duration-300 flex-shrink-0 ${collapsed ? "w-14" : "w-56"}`}
        style={{ background: "hsl(var(--sidebar-background, var(--card)))" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border h-14">
          <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: "hsl(var(--cyan))" }}>
            <Icon name="ShieldCheck" size={13} style={{ color: "hsl(var(--primary-foreground))" }} />
          </div>
          {!collapsed && <span className="font-semibold text-sm text-foreground whitespace-nowrap">Админ-панель</span>}
          <button onClick={() => setCollapsed(v => !v)} className="ml-auto text-muted-foreground hover:text-foreground">
            <Icon name={collapsed ? "ChevronRight" : "ChevronLeft"} size={14} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-4">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              {!collapsed && (
                <div className="px-4 mb-1">
                  <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{group}</span>
                </div>
              )}
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-all relative ${
                    active === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={active === item.id ? { background: "hsl(var(--sidebar-accent, var(--secondary)))" } : {}}
                >
                  {active === item.id && (
                    <span className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r" style={{ background: "hsl(var(--cyan))" }} />
                  )}
                  <Icon name={item.icon} size={15} style={active === item.id ? { color: "hsl(var(--cyan))" } : {}} />
                  {!collapsed && <span className="font-medium">{item.label}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-border p-3">
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
            <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
              <Icon name="ShieldCheck" size={12} style={{ color: "hsl(var(--cyan))" }} />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground truncate">{user?.name || "Администратор"}</div>
                <div className="text-[10px] text-muted-foreground">Полный доступ</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6 flex-shrink-0"
          style={{ background: "hsl(var(--card))" }}>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Администратор</span>
            <Icon name="ChevronRight" size={12} className="text-muted-foreground" />
            <span className="font-medium text-foreground">{SECTION_LABELS[active]}</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="w-8 h-8 rounded flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
              <Icon name="Bell" size={15} />
            </button>
            <button onClick={() => navigate("/manager")}
              title="Кабинет менеджера"
              className="w-8 h-8 rounded flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
              <Icon name="LayoutDashboard" size={15} />
            </button>
            <button onClick={async () => { await logout(); navigate("/login", { replace: true }); }}
              title="Выйти"
              className="w-8 h-8 rounded flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
              <Icon name="LogOut" size={15} />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {active === "overview"      && <AdminOverview />}
          {active === "clients"       && <MgrClients />}
          {active === "create_client" && <AdminCreateClient onCreated={() => setActive("clients")} />}
          {active === "catalog"       && <MgrCatalog />}
          {active === "users"         && <AdminUsers />}
          {active === "settings"      && <AdminSettings />}
          {active === "bank"          && <AdminBank />}
          {active === "tariffs"       && <AdminTariffs />}
          {active === "zones"         && <AdminZones />}
          {active === "archive"       && <AdminArchive />}
          {active === "security"      && <AdminSecurity />}
        </div>
      </main>
    </div>
  );
}
