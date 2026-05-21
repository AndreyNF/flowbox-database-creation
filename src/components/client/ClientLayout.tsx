import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout, getCurrentUser } from "@/lib/auth";
import Icon from "@/components/ui/icon";

export type ClientSection =
  | "overview" | "catalog" | "calculator" | "orders"
  | "finance" | "claims" | "settings" | "support";

const NAV: { id: ClientSection; label: string; icon: string }[] = [
  { id: "overview",    label: "Обзор",       icon: "LayoutDashboard" },
  { id: "catalog",     label: "Каталог",     icon: "Package" },
  { id: "calculator",  label: "Калькулятор", icon: "Calculator" },
  { id: "orders",      label: "Заказы",      icon: "ShoppingCart" },
  { id: "finance",     label: "Финансы",     icon: "Wallet" },
  { id: "claims",      label: "Рекламации",  icon: "AlertOctagon" },
  { id: "settings",    label: "Настройки",   icon: "Settings" },
  { id: "support",     label: "Поддержка",   icon: "MessageCircle" },
];

interface Props {
  section: ClientSection;
  onSection: (s: ClientSection) => void;
  companyName: string;
  children: React.ReactNode;
  notifications?: number;
}

export default function ClientLayout({ section, onSection, companyName, children, notifications = 0 }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const user = getCurrentUser();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border transition-all duration-300 flex-shrink-0 ${collapsed ? "w-14" : "w-52"}`}
        style={{ background: "hsl(var(--sidebar-background))" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border">
          <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
            style={{ background: "hsl(var(--cyan))" }}>
            <span className="text-xs font-mono font-bold" style={{ color: "hsl(var(--primary-foreground))" }}>F</span>
          </div>
          {!collapsed && (
            <span className="font-semibold text-sm text-foreground truncate">FlowBox</span>
          )}
          <button onClick={() => setCollapsed(c => !c)} className="ml-auto text-muted-foreground hover:text-foreground flex-shrink-0">
            <Icon name={collapsed ? "ChevronRight" : "ChevronLeft"} size={13} />
          </button>
        </div>

        {/* Company badge */}
        {!collapsed && (
          <div className="mx-3 mt-3 mb-1 px-3 py-2 rounded-lg" style={{ background: "hsla(195,90%,48%,0.08)", border: "1px solid hsla(195,90%,48%,0.2)" }}>
            <div className="text-[10px] text-muted-foreground mb-0.5">Компания</div>
            <div className="text-xs font-medium text-foreground truncate">{companyName || "—"}</div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => onSection(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all relative ${
                section === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              style={section === item.id ? { background: "hsl(var(--sidebar-accent))" } : {}}
            >
              {section === item.id && (
                <span className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r" style={{ background: "hsl(var(--cyan))" }} />
              )}
              <div className="relative flex-shrink-0">
                <Icon name={item.icon} size={15}
                  style={section === item.id ? { color: "hsl(var(--cyan))" } : {}} />
                {item.id === "support" && notifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[9px] font-bold flex items-center justify-center"
                    style={{ background: "hsl(var(--rose))", color: "#fff" }}>
                    {notifications > 9 ? "9+" : notifications}
                  </span>
                )}
              </div>
              {!collapsed && <span className="font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-border p-3">
          <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
            <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
              <Icon name="User" size={13} className="text-muted-foreground" />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-foreground truncate">{user?.name || "Клиент"}</div>
                <div className="text-[10px] text-muted-foreground">Личный кабинет</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6 flex-shrink-0"
          style={{ background: "hsl(var(--card))" }}>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Кабинет</span>
            <Icon name="ChevronRight" size={12} className="text-muted-foreground" />
            <span className="font-medium text-foreground">
              {NAV.find(n => n.id === section)?.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSection("support")}
              className="relative w-8 h-8 rounded flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <Icon name="Bell" size={15} />
              {notifications > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: "hsl(var(--rose))" }} />
              )}
            </button>
            <button
              onClick={async () => { await logout(); navigate("/login", { replace: true }); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon name="LogOut" size={13} />
              {!collapsed && "Выйти"}
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}