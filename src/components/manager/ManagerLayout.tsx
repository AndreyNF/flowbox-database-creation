import { useNavigate } from "react-router-dom";
import { logout, getCurrentUser } from "@/lib/auth";
import Icon from "@/components/ui/icon";

export type MgrSection =
  | "overview" | "clients" | "catalog" | "orders"
  | "finance" | "claims" | "suppliers" | "logistics" | "support";

const NAV: { id: MgrSection; label: string; icon: string; group: string }[] = [
  { id: "overview",   label: "Обзор",       icon: "LayoutDashboard", group: "Главная" },
  { id: "clients",    label: "Клиенты",     icon: "Building2",       group: "Работа" },
  { id: "catalog",    label: "Каталог",     icon: "Package",         group: "Работа" },
  { id: "orders",     label: "Заказы",      icon: "ShoppingCart",    group: "Работа" },
  { id: "finance",    label: "Финансы",     icon: "Wallet",          group: "Работа" },
  { id: "claims",     label: "Рекламации",  icon: "AlertOctagon",    group: "Работа" },
  { id: "suppliers",  label: "Поставщики",  icon: "Truck",           group: "Система" },
  { id: "logistics",  label: "Логистика",   icon: "MapPin",          group: "Система" },
  { id: "support",    label: "Поддержка",   icon: "MessageCircle",   group: "Система" },
];

interface Props {
  section: MgrSection;
  onSection: (s: MgrSection) => void;
  alerts?: number;
  children: React.ReactNode;
}

export default function ManagerLayout({ section, onSection, alerts = 0, children }: Props) {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const grouped = NAV.reduce<Record<string, typeof NAV>>((a, n) => {
    (a[n.group] = a[n.group] || []).push(n);
    return a;
  }, {});

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="w-52 flex flex-col border-r border-border flex-shrink-0"
        style={{ background: "hsl(var(--sidebar-background))" }}>
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border">
          <div className="w-7 h-7 rounded flex items-center justify-center"
            style={{ background: "hsl(var(--cyan))" }}>
            <span className="text-xs font-mono font-bold" style={{ color: "hsl(var(--primary-foreground))" }}>S</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground leading-tight">SupplyOS</div>
            <div className="text-[9px] text-muted-foreground">Менеджер</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-3">
              <div className="px-4 mb-1">
                <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">{group}</span>
              </div>
              {items.map(item => (
                <button key={item.id} onClick={() => onSection(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all relative ${
                    section === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={section === item.id ? { background: "hsl(var(--sidebar-accent))" } : {}}>
                  {section === item.id && <span className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r" style={{ background: "hsl(var(--cyan))" }} />}
                  <div className="relative flex-shrink-0">
                    <Icon name={item.icon} size={15} style={section === item.id ? { color: "hsl(var(--cyan))" } : {}} />
                    {item.id === "support" && alerts > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-[9px] font-bold flex items-center justify-center"
                        style={{ background: "hsl(var(--rose))", color: "#fff" }}>
                        {alerts > 9 ? "9+" : alerts}
                      </span>
                    )}
                  </div>
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
              <Icon name="UserCog" size={13} className="text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{user?.name || "Менеджер"}</div>
              <div className="text-[10px] text-muted-foreground">{user?.role === "admin" ? "Администратор" : "Менеджер"}</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 flex-shrink-0"
          style={{ background: "hsl(var(--card))" }}>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Менеджер</span>
            <Icon name="ChevronRight" size={12} className="text-muted-foreground" />
            <span className="font-medium text-foreground">{NAV.find(n => n.id === section)?.label}</span>
          </div>
          <div className="flex items-center gap-2">
            {alerts > 0 && (
              <button onClick={() => onSection("support")}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border text-rose-400 border-rose-400/30 bg-rose-400/5">
                <Icon name="Bell" size={12} />
                {alerts} новых
              </button>
            )}
            <button onClick={async () => { await logout(); navigate("/login", { replace: true }); }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Icon name="LogOut" size={13} />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}