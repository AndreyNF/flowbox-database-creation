import Icon from "@/components/ui/icon";
import { Tariff, Product, fmtI, calcLogisticsCost } from "./CalculatorTypes";
import { Slider, NumInput, Block } from "./CalculatorUI";

interface Props {
  // Товар
  selectedProduct: Product | null;
  purchasePrice: string;
  showProductSearch: boolean;
  productQuery: string;
  productsLoading: boolean;
  filteredProducts: Product[];
  onProductClear: () => void;
  onProductSearchOpen: () => void;
  onProductSearchClose: () => void;
  onProductQueryChange: (v: string) => void;
  onProductSelect: (p: Product) => void;
  onPurchasePriceChange: (v: string) => void;

  // Комиссии
  tariffs: Tariff[];
  tariffsLoading: boolean;
  selectedTariff: Tariff | null;
  commissionOverride: string;
  finalCardPrice: number;
  finalCommissionPct: number;
  managerMode: boolean;
  onTariffChange: (t: Tariff | null) => void;
  onCommissionOverrideChange: (v: string) => void;
  onCommissionOverrideClear: () => void;

  // Параметры
  profitPct: number;
  returnsPct: number;
  adsPct: number;
  onProfitChange: (v: number) => void;
  onReturnsChange: (v: number) => void;
  onAdsChange: (v: number) => void;

  // Доставка (только менеджер)
  deliveryMode: "own" | "partner_ozon";
  logistics: string;
  partnerDeliveryCost: number;
  onDeliveryModeChange: (v: "own" | "partner_ozon") => void;
  onLogisticsChange: (v: string) => void;

  // Досрочная
  earlyMode: "none" | "standard" | "ozon_bank";
  onEarlyModeChange: (v: "none" | "standard" | "ozon_bank") => void;
}

export default function CalculatorLeftColumn({
  selectedProduct, purchasePrice, showProductSearch, productQuery,
  productsLoading, filteredProducts,
  onProductClear, onProductSearchOpen, onProductSearchClose,
  onProductQueryChange, onProductSelect, onPurchasePriceChange,
  tariffs, tariffsLoading, selectedTariff, commissionOverride,
  finalCardPrice, finalCommissionPct, managerMode,
  onTariffChange, onCommissionOverrideChange, onCommissionOverrideClear,
  profitPct, returnsPct, adsPct,
  onProfitChange, onReturnsChange, onAdsChange,
  deliveryMode, logistics, partnerDeliveryCost,
  onDeliveryModeChange, onLogisticsChange,
  earlyMode, onEarlyModeChange,
}: Props) {
  return (
    <div className="space-y-4">

      {/* Блок 1: Товар */}
      <Block title="1. Товар" icon="Package">
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-muted-foreground">Выбрать из каталога (необязательно)</label>
          </div>
          {selectedProduct ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-secondary">
              <Icon name="Package" size={13} style={{ color: "hsl(var(--cyan))" }} />
              <span className="text-xs text-foreground flex-1 truncate">{selectedProduct.trade_name}</span>
              <button onClick={onProductClear} className="text-muted-foreground hover:text-foreground">
                <Icon name="X" size={13} />
              </button>
            </div>
          ) : (
            <button onClick={onProductSearchOpen}
              className="w-full px-3 py-2.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-ring hover:text-foreground transition-all text-left flex items-center gap-2">
              <Icon name="Search" size={13} /> Найти товар из каталога...
            </button>
          )}

          {showProductSearch && (
            <div className="mt-2 rounded-lg border border-border overflow-hidden" style={{ background: "hsl(var(--card))" }}>
              <div className="p-2 border-b border-border">
                <input autoFocus type="text" value={productQuery}
                  onChange={e => onProductQueryChange(e.target.value)}
                  placeholder="Поиск по названию..."
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground" />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {productsLoading
                  ? <div className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Icon name="Loader2" size={13} className="animate-spin" /> Загрузка...
                    </div>
                  : filteredProducts.length === 0
                  ? <div className="py-4 text-center text-xs text-muted-foreground">Не найдено</div>
                  : filteredProducts.slice(0, 30).map(p => (
                      <button key={p.id} onClick={() => onProductSelect(p)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary text-left transition-colors border-b border-border last:border-0">
                        <Icon name="Package" size={11} className="text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-foreground truncate">{p.trade_name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {p.purchase_price ? `${fmtI(p.purchase_price)} ₽` : "—"}
                          </div>
                        </div>
                      </button>
                    ))}
              </div>
              <div className="p-2 border-t border-border">
                <button onClick={onProductSearchClose}
                  className="w-full text-xs text-muted-foreground hover:text-foreground">
                  Закрыть
                </button>
              </div>
            </div>
          )}
        </div>

        <NumInput label="Закупочная цена с НДС" value={purchasePrice}
          onChange={onPurchasePriceChange} suffix="₽" hint="вашa цена" />
      </Block>

      {/* Блок 2: Комиссии Ozon */}
      <Block title="2. Комиссии Ozon" icon="BarChart3">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Категория товара</label>
            {tariffsLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon name="Loader2" size={13} className="animate-spin" /> Загрузка...
              </div>
            ) : tariffs.length === 0 ? (
              <div className="text-xs text-muted-foreground">Категории не найдены в базе</div>
            ) : (
              <select
                value={selectedTariff?.id || ""}
                onChange={e => {
                  const t = tariffs.find(t => t.id === e.target.value);
                  onTariffChange(t || null);
                  onCommissionOverrideClear();
                }}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                {tariffs.map(t => (
                  <option key={t.id} value={t.id}>{t.category_name}</option>
                ))}
              </select>
            )}
          </div>

          {selectedTariff && (
            <div className="grid grid-cols-4 gap-1 rounded-lg p-2" style={{ background: "hsl(var(--secondary))" }}>
              {[
                { label: "<1500", val: (selectedTariff.commission_lt_1500 * 100).toFixed(1) },
                { label: "1500–5К", val: (selectedTariff.commission_1500_5000 * 100).toFixed(1) },
                { label: "5К–10К", val: (selectedTariff.commission_5000_10000 * 100).toFixed(1) },
                { label: ">10000", val: (selectedTariff.commission_gt_10000 * 100).toFixed(1) },
              ].map(r => {
                const isActive = (
                  (r.label === "<1500" && finalCardPrice < 1500) ||
                  (r.label === "1500–5К" && finalCardPrice >= 1500 && finalCardPrice < 5000) ||
                  (r.label === "5К–10К" && finalCardPrice >= 5000 && finalCardPrice < 10000) ||
                  (r.label === ">10000" && finalCardPrice >= 10000)
                );
                return (
                  <div key={r.label} className={`rounded p-1.5 text-center transition-all ${isActive ? "border" : ""}`}
                    style={isActive ? { borderColor: "hsl(var(--cyan))", background: "hsla(195,90%,48%,0.1)" } : {}}>
                    <div className="text-[9px] text-muted-foreground">{r.label}</div>
                    <div className={`text-xs font-mono font-semibold ${isActive ? "" : "text-muted-foreground"}`}
                      style={isActive ? { color: "hsl(var(--cyan))" } : {}}>{r.val}%</div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-muted-foreground">% Вознаграждения</label>
                {commissionOverride !== "" && (
                  <button onClick={onCommissionOverrideClear}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                    <Icon name="RotateCcw" size={10} />авто
                  </button>
                )}
              </div>
              <div className="relative">
                <input type="number"
                  value={commissionOverride !== "" ? commissionOverride : (finalCommissionPct * 100).toFixed(1)}
                  onChange={e => onCommissionOverrideChange(e.target.value)}
                  readOnly={!managerMode}
                  className={`w-full pl-3 pr-7 py-2.5 text-sm rounded-lg border border-border font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring
                    ${!managerMode ? "bg-secondary/50 text-muted-foreground cursor-not-allowed" : "bg-secondary"}`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
            </div>
            <NumInput label="Эквайринг" value="1.9" suffix="%" readOnly hint="фикс." />
          </div>

          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border"
            style={{ background: "hsl(var(--secondary))" }}>
            <span className="text-xs text-muted-foreground">Сервисный сбор</span>
            <span className="text-xs font-mono text-foreground">20 ₽</span>
          </div>
        </div>
      </Block>

      {/* Блок 3: Параметры */}
      <Block title="3. Ваши параметры" icon="SlidersHorizontal">
        <div className="space-y-4">
          <Slider label="Желаемая прибыль" value={profitPct} min={5} max={80}
            onChange={onProfitChange} color="var(--cyan)" />

          {/* Способ доставки — только менеджер */}
          {managerMode && (
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Способ доставки</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "own",          label: "Наша служба",   icon: "Truck" },
                  { id: "partner_ozon", label: "Партнёры Ozon", icon: "MapPin" },
                ] as const).map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => onDeliveryModeChange(opt.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                      deliveryMode === opt.id ? "border-ring" : "border-border hover:border-ring/50"
                    }`}
                    style={deliveryMode === opt.id
                      ? { background: "hsla(195,90%,48%,0.08)" }
                      : { background: "hsl(var(--secondary))" }}
                  >
                    <Icon name={opt.icon} size={13}
                      style={{ color: deliveryMode === opt.id ? "hsl(var(--cyan))" : "hsl(var(--muted-foreground))" }} />
                    <span style={{ color: deliveryMode === opt.id ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Логистика до ТК — только менеджер, только при own */}
          {managerMode && deliveryMode === "own" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-muted-foreground">Логистика до ТК</label>
                {selectedProduct && selectedProduct.package_kg > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    авто: {fmtI(calcLogisticsCost(selectedProduct.package_kg))} ₽ ({selectedProduct.package_kg} кг)
                  </span>
                )}
              </div>
              <div className="relative">
                <input type="number" value={logistics} onChange={e => onLogisticsChange(e.target.value)}
                  className="w-full pl-3 pr-7 py-2.5 text-sm rounded-lg border border-border bg-secondary text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₽</span>
              </div>
            </div>
          )}

          {/* Тариф партнёров Ozon — только менеджер */}
          {managerMode && deliveryMode === "partner_ozon" && finalCardPrice > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-border px-3 py-2.5"
              style={{ background: "hsl(var(--secondary))" }}>
              <Icon name="Info" size={13} className="text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs text-foreground font-medium">
                  Доставка Ozon: <span className="font-mono" style={{ color: "hsl(var(--cyan))" }}>{fmtI(partnerDeliveryCost)} ₽</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Минимальный тариф Ozon · включён в цену карточки
                </div>
              </div>
            </div>
          )}

          <Slider label="Резерв на возвраты и отказы" value={returnsPct} min={0} max={20}
            onChange={onReturnsChange} color="var(--amber)" />
          <Slider label="Реклама" value={adsPct} min={0} max={30}
            onChange={onAdsChange} color="var(--violet)" />
        </div>
      </Block>

      {/* Блок 4: Досрочная */}
      <Block title="4. Досрочная выплата" icon="Zap">
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: "none", label: "Нет", sub: "0%" },
            { id: "standard", label: "Обычный", sub: `${((selectedTariff?.early_payout_standard ?? 0.049) * 100).toFixed(2)}%` },
            { id: "ozon_bank", label: "Ozon Банк", sub: `${((selectedTariff?.early_payout_ozon_bank ?? 0.0339) * 100).toFixed(2)}%` },
          ].map(opt => (
            <button key={opt.id} onClick={() => onEarlyModeChange(opt.id as "none" | "standard" | "ozon_bank")}
              className={`py-3 rounded-xl border text-center transition-all ${earlyMode === opt.id ? "border-ring" : "border-border hover:border-ring/50"}`}
              style={earlyMode === opt.id ? { background: "hsla(195,90%,48%,0.1)" } : { background: "hsl(var(--secondary))" }}>
              <div className="text-xs font-semibold text-foreground">{opt.label}</div>
              <div className="text-[11px] font-mono mt-0.5"
                style={{ color: earlyMode === opt.id ? "hsl(var(--cyan))" : "hsl(var(--muted-foreground))" }}>{opt.sub}</div>
            </button>
          ))}
        </div>
      </Block>
    </div>
  );
}
