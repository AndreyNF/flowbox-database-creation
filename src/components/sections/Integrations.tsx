import { useState } from "react";
import Icon from "@/components/ui/icon";

const API_KEYS = [
  { name: "Ozon API — Production", key: "oz_prod_••••••••••••••••••••8f4a", created: "01.03.2026", lastUsed: "21.05.2026 09:41", requests: "1 240 req/день", status: "Активен" },
  { name: "Ozon API — Sandbox", key: "oz_sand_••••••••••••••••••••2b1c", created: "15.01.2026", lastUsed: "20.05.2026 17:22", requests: "84 req/день", status: "Активен" },
  { name: "Внутренний API", key: "int_••••••••••••••••••••••••9d3e", created: "10.02.2026", lastUsed: "21.05.2026 09:00", requests: "320 req/день", status: "Активен" },
];

const EDO = [
  { name: "Диадок (Контур)", type: "ЭДО", status: "Подключён", docs: "1 247 доков", lastSync: "21.05.2026 08:00" },
  { name: "СБИС", type: "ЭДО", status: "Не подключён", docs: "—", lastSync: "—" },
  { name: "1С-ЭДО", type: "ЭДО", status: "Не подключён", docs: "—", lastSync: "—" },
];

const MARKETPLACES = [
  {
    name: "Ozon realFBS",
    logo: "🟠",
    status: "Синхронизирован",
    lastSync: "21.05.2026 09:41",
    products: 12480,
    orders: 1240,
    enabled: true,
  },
  {
    name: "Ozon FBO",
    logo: "🟠",
    status: "Синхронизирован",
    lastSync: "21.05.2026 09:30",
    products: 8340,
    orders: 412,
    enabled: true,
  },
  {
    name: "Wildberries",
    logo: "🟣",
    status: "Не подключён",
    lastSync: "—",
    products: 0,
    orders: 0,
    enabled: false,
  },
  {
    name: "Яндекс Маркет",
    logo: "🔴",
    status: "Не подключён",
    lastSync: "—",
    products: 0,
    orders: 0,
    enabled: false,
  },
];

export default function Integrations() {
  const [showKey, setShowKey] = useState<number | null>(null);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Интеграции и API</h1>
          <p className="text-xs text-muted-foreground mt-0.5">API-ключи, ЭДО операторы и синхронизация с маркетплейсами</p>
        </div>
      </div>

      {/* Marketplaces */}
      <div className="rounded-lg border border-border overflow-hidden" style={{ background: "hsl(var(--card))" }}>
        <div className="px-5 py-4 border-b border-border">
          <div className="text-sm font-medium text-foreground">Маркетплейсы</div>
        </div>
        <div className="grid grid-cols-4 divide-x divide-border">
          {MARKETPLACES.map(m => (
            <div key={m.name} className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{m.logo}</span>
                  <span className="text-xs font-medium text-foreground">{m.name}</span>
                </div>
                <div className={`w-3 h-3 rounded-full ${m.enabled ? "bg-green-400" : "bg-border"}`} />
              </div>
              {m.enabled ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1 text-xs text-green-400">
                    <Icon name="CheckCircle" size={11} />
                    {m.status}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Последняя синхр.: {m.lastSync}</div>
                  <div className="flex gap-3 mt-2">
                    <div>
                      <div className="font-mono text-sm font-medium text-foreground">{m.products.toLocaleString("ru")}</div>
                      <div className="text-[10px] text-muted-foreground">товаров</div>
                    </div>
                    <div>
                      <div className="font-mono text-sm font-medium text-foreground">{m.orders.toLocaleString("ru")}</div>
                      <div className="text-[10px] text-muted-foreground">заказов</div>
                    </div>
                  </div>
                  <button className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Icon name="RefreshCw" size={11} /> Синхронизировать
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Не подключён</div>
                  <button className="mt-1 text-xs px-3 py-1.5 rounded font-medium w-full"
                    style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
                    Подключить
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* API Keys */}
        <div className="rounded-lg border border-border overflow-hidden" style={{ background: "hsl(var(--card))" }}>
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">API-ключи</span>
            <button className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded font-medium"
              style={{ background: "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
              <Icon name="Plus" size={11} />
              Создать
            </button>
          </div>
          <div className="divide-y divide-border">
            {API_KEYS.map((k, i) => (
              <div key={k.name} className="px-5 py-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-medium text-foreground">{k.name}</span>
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                    {k.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <code className="text-[11px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded flex-1 truncate">
                    {showKey === i ? "oz_prod_xk9s2m..." : k.key}
                  </code>
                  <button onClick={() => setShowKey(showKey === i ? null : i)}
                    className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                    <Icon name={showKey === i ? "EyeOff" : "Eye"} size={13} />
                  </button>
                  <button className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                    <Icon name="Copy" size={13} />
                  </button>
                </div>
                <div className="flex gap-4 text-[10px] text-muted-foreground">
                  <span>Создан: {k.created}</span>
                  <span>Использован: {k.lastUsed}</span>
                  <span>{k.requests}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* EDO */}
        <div className="rounded-lg border border-border overflow-hidden" style={{ background: "hsl(var(--card))" }}>
          <div className="px-5 py-4 border-b border-border">
            <span className="text-sm font-medium text-foreground">ЭДО Операторы</span>
          </div>
          <div className="divide-y divide-border">
            {EDO.map(e => (
              <div key={e.name} className="px-5 py-5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-foreground mb-1">{e.name}</div>
                  {e.status === "Подключён" ? (
                    <div className="space-y-0.5">
                      <div className="text-[10px] text-green-400 flex items-center gap-1">
                        <Icon name="CheckCircle" size={10} /> {e.status}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{e.docs} · Синхр. {e.lastSync}</div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-muted-foreground">{e.status}</div>
                  )}
                </div>
                {e.status === "Подключён" ? (
                  <button className="text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors">
                    Настройки
                  </button>
                ) : (
                  <button className="text-xs px-2.5 py-1 rounded font-medium"
                    style={{ background: "hsl(var(--secondary))", color: "hsl(var(--foreground))" }}>
                    Подключить
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Webhook */}
          <div className="px-5 py-4 border-t border-border">
            <div className="text-xs font-medium text-foreground mb-2">Webhook URL</div>
            <div className="flex items-center gap-2">
              <code className="text-[11px] font-mono text-muted-foreground bg-secondary px-2 py-1.5 rounded flex-1 truncate">
                https://api.flowbox.ru/webhook/orders
              </code>
              <button className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                <Icon name="Copy" size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}