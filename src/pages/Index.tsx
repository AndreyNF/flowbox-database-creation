import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout, getCurrentUser } from "@/lib/auth";
import Icon from "@/components/ui/icon";
import Dashboard from "@/components/sections/Dashboard";
import Companies from "@/components/sections/Companies";
import Suppliers from "@/components/sections/Suppliers";
import Orders from "@/components/sections/Orders";
import Delivery from "@/components/sections/Delivery";
import Users from "@/components/sections/Users";
import Finance from "@/components/sections/Finance";
import Integrations from "@/components/sections/Integrations";

const NAV_ITEMS = [
  { id: "dashboard", label: "Дашборд", icon: "LayoutDashboard", section: "Обзор" },
  { id: "companies", label: "Компании", icon: "Building2", section: "Клиенты" },
  { id: "suppliers", label: "Поставщики", icon: "Truck", section: "Каталог" },
  { id: "orders", label: "Заказы", icon: "ShoppingCart", section: "Операции" },
  { id: "delivery", label: "Доставка", icon: "MapPin", section: "Логистика" },
  { id: "users", label: "Пользователи", icon: "Users", section: "Доступ" },
  { id: "finance", label: "Финансы", icon: "CreditCard", section: "Финансы" },
  { id: "integrations", label: "Интеграции", icon: "Plug", section: "Система" },
];

const SECTION_COMPONENTS: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  companies: Companies,
  suppliers: Suppliers,
  orders: Orders,
  delivery: Delivery,
  users: Users,
  finance: Finance,
  integrations: Integrations,
};

export default function Index() {
  const [active, setActive] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const user = getCurrentUser();

  const ActiveSection = SECTION_COMPONENTS[active] || Dashboard;

  const groupedNav = NAV_ITEMS.reduce<Record<string, typeof NAV_ITEMS>>((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border transition-all duration-300 ${
          collapsed ? "w-14" : "w-56"
        }`}
        style={{ background: "hsl(var(--sidebar-background))" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border h-14">
          <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: "hsl(var(--cyan))" }}>
            <span className="text-xs font-mono font-medium" style={{ color: "hsl(var(--primary-foreground))" }}>S</span>
          </div>
          {!collapsed && (
            <span className="font-semibold text-sm tracking-wide text-foreground whitespace-nowrap">
              FlowBox
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon name={collapsed ? "ChevronRight" : "ChevronLeft"} size={14} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-4">
          {Object.entries(groupedNav).map(([section, items]) => (
            <div key={section}>
              {!collapsed && (
                <div className="px-4 mb-1">
                  <span className="text-[10px] font-medium uppercase tracking-widest"
                    style={{ color: "hsl(var(--muted-foreground))" }}>
                    {section}
                  </span>
                </div>
              )}
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActive(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-all duration-150 relative ${
                    active === item.id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={active === item.id ? {
                    background: "hsl(var(--sidebar-accent))",
                  } : {}}
                  title={collapsed ? item.label : undefined}
                >
                  {active === item.id && (
                    <span
                      className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r"
                      style={{ background: "hsl(var(--cyan))" }}
                    />
                  )}
                  <Icon
                    name={item.icon}
                    size={15}
                    style={active === item.id ? { color: "hsl(var(--cyan))" } : {}}
                  />
                  {!collapsed && (
                    <span className="font-medium">{item.label}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-3">
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
            <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-medium text-foreground">
                {user?.name?.slice(0, 2).toUpperCase() || "АД"}
              </span>
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground truncate">{user?.name || "Администратор"}</div>
                <div className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>Супер-доступ</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6 flex-shrink-0"
          style={{ background: "hsl(var(--card))" }}>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {NAV_ITEMS.find(n => n.id === active)?.section}
            </span>
            <Icon name="ChevronRight" size={12} className="text-muted-foreground" />
            <span className="font-medium text-foreground">
              {NAV_ITEMS.find(n => n.id === active)?.label}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-border"
              style={{ color: "hsl(var(--muted-foreground))" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-dot inline-block" />
              Ozon API: Активен
            </div>
            <button className="w-8 h-8 rounded flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
              <Icon name="Bell" size={15} />
            </button>
            <button onClick={() => navigate("/users")}
              className="w-8 h-8 rounded flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              title="Управление пользователями">
              <Icon name="Users" size={15} />
            </button>
            <button onClick={async () => { await logout(); navigate("/login", { replace: true }); }}
              className="w-8 h-8 rounded flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              title="Выйти">
              <Icon name="LogOut" size={15} />
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-6">
          <ActiveSection />
        </div>
      </main>
    </div>
  );
}