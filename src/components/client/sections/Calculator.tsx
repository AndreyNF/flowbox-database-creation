import { useState, useEffect, useMemo } from "react";
import Icon from "@/components/ui/icon";
import { SectionHeader } from "../shared";
import { getCurrentUser } from "@/lib/auth";

const CALC_URL = "https://functions.poehali.dev/1be91c0d-825b-4a5f-9488-4a1833027306";

// ── types ──────────────────────────────────────────────────────────────────
interface Tariff {
  id: string; category_name: string; product_type: string;
  commission_lt_1500: number; commission_1500_5000: number;
  commission_5000_10000: number; commission_gt_10000: number;
  acquiring_percent: number; service_fee_fixed: number;
  early_payout_standard: number; early_payout_ozon_bank: number;
}
interface Product {
  id: string; trade_name: string; purchase_price: number;
  package_kg: number; our_price: number | null; category_ozon: string | null;
}
interface DeliveryRate {
  price_from: number; price_to: number | null; cost: number;
}
interface CalcProduct { id: string; trade_name: string; our_price: number; }
interface Props { initialProduct?: CalcProduct | null; isManager?: boolean; }

// ── helpers ────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString("ru", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
function fmtI(n: number): string {
  return n.toLocaleString("ru", { maximumFractionDigits: 0 });
}

function calcLogisticsCost(packageKg: number): number {
  if (packageKg <= 0) return 0;
  if (packageKg <= 100) return 600;
  return 600 + (packageKg - 100) * 2.5;
}

function calcPartnerDeliveryCost(orderPrice: number, rates: DeliveryRate[]): number {
  if (!rates.length) {
    if (orderPrice < 500)   return 200;
    if (orderPrice < 1000)  return 300;
    if (orderPrice < 3000)  return 400;
    if (orderPrice < 7500)  return 700;
    if (orderPrice < 15000) return 1300;
    if (orderPrice < 30000) return 1900;
    if (orderPrice < 75000) return 2200;
    return 2500;
  }
  const match = rates.find(r =>
    orderPrice >= r.price_from && (r.price_to === null || orderPrice < r.price_to)
  );
  return match ? match.cost : rates[rates.length - 1].cost;
}

function getCommissionRate(tariff: Tariff, price: number): number {
  if (price < 1500)  return tariff.commission_lt_1500;
  if (price < 5000)  return tariff.commission_1500_5000;
  if (price < 10000) return tariff.commission_5000_10000;
  return tariff.commission_gt_10000;
}

// ── FORMULA ────────────────────────────────────────────────────────────────
// База = purchase × 1.08 + delivery_to_tc (только если partner_ozon, иначе 0)
// X = База × (1 + profit%)
//     ÷ (1 - early%)
//     ÷ (1 - commission% - 0.019 - returns% - ads%)
//   + service_fee
// Доставка партнёров Ozon считается от цены карточки (итерация)
const PLATFORM_MARKUP = 0.08; // 8% — наценка платформы, скрыта от клиента

function calcCardPrice(
  base: number,         // purchase × 1.08 + delivery_to_tc (if partner)
  profitPct: number,
  earlyPct: number,
  commissionPct: number,
  returnsPct: number,
  adsPct: number,
  serviceFee: number,
): number {
  const acquiring = 0.019;
  const denom2 = 1 - commissionPct - acquiring - returnsPct - adsPct;
  if (denom2 <= 0) return 0;
  const x = (base * (1 + profitPct)) / (1 - earlyPct) / denom2;
  return x + serviceFee;
}

// ── Slider input ────────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step = 1, unit = "%", onChange, color }: {
  label: string; value: number; min: number; max: number; step?: number;
  unit?: string; onChange: (v: number) => void; color?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-muted-foreground">{label}</label>
        <span className="text-xs font-mono font-semibold text-foreground">{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-cyan-500"
        style={color ? { accentColor: `hsl(${color})` } : {}}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

// ── Number input ────────────────────────────────────────────────────────────
function NumInput({ label, value, onChange, prefix, suffix, readOnly, hint }: {
  label: string; value: string; onChange?: (v: string) => void;
  prefix?: string; suffix?: string; readOnly?: boolean; hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-muted-foreground">{label}</label>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      <div className="relative flex items-center">
        {prefix && <span className="absolute left-3 text-xs text-muted-foreground">{prefix}</span>}
        <input type="number" value={value} readOnly={readOnly}
          onChange={e => onChange?.(e.target.value)}
          className={`w-full py-2.5 text-sm rounded-lg border border-border font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors
            ${prefix ? "pl-7" : "pl-3"} ${suffix ? "pr-12" : "pr-3"}
            ${readOnly ? "bg-secondary/50 text-muted-foreground cursor-not-allowed" : "bg-secondary"}`}
        />
        {suffix && <span className="absolute right-3 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

// ── Row in detail table ─────────────────────────────────────────────────────
function Row({ label, pct, rub, minus = true, bold, sep, color }: {
  label: string; pct?: string; rub: string;
  minus?: boolean; bold?: boolean; sep?: boolean; color?: string;
}) {
  return (
    <div className={`flex items-center justify-between py-2 text-xs ${sep ? "border-t border-border mt-1 pt-3" : "border-b border-border/50 last:border-0"}`}>
      <span className={bold ? "text-foreground font-medium" : "text-muted-foreground"}>{label}</span>
      <div className="flex items-center gap-3 font-mono">
        {pct && <span className="text-muted-foreground">{pct}</span>}
        <span className={bold ? "font-bold text-sm" : ""} style={color ? { color: `hsl(${color})` } : {}}>
          {minus && !bold ? "−" : ""}{rub}
        </span>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function Calculator({ initialProduct, isManager }: Props) {
  const user = getCurrentUser();
  const companyId = user?.company_id || "demo";
  const managerMode = isManager ?? (user?.role === "manager" || user?.role === "admin");

  // Data from backend
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [deliveryRates, setDeliveryRates] = useState<DeliveryRate[]>([]);
  const [tariffsLoading, setTariffsLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(false);

  // Блок доставки — клиент не видит, только менеджер
  const [deliveryMode, setDeliveryMode] = useState<"own" | "partner_ozon">("own");

  // Блок 1: Товар
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [purchasePrice, setPurchasePrice] = useState(
    initialProduct ? String(initialProduct.our_price) : ""
  );
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productQuery, setProductQuery] = useState("");

  // Блок 2: Комиссии
  const [selectedTariff, setSelectedTariff] = useState<Tariff | null>(null);
  const [commissionOverride, setCommissionOverride] = useState<string>("");

  // Блок 3: Параметры (клиент управляет только этим)
  const [profitPct, setProfitPct] = useState(25);
  const [returnsPct, setReturnsPct] = useState(5);
  const [adsPct, setAdsPct] = useState(5);

  // Только для менеджера: стоимость логистики до ТК (если own)
  const [logistics, setLogistics] = useState("600");

  // Блок 4: Досрочная
  const [earlyMode, setEarlyMode] = useState<"none" | "standard" | "ozon_bank">("none");

  // Actions state
  const [applying, setApplying] = useState(false);
  const [applyOk, setApplyOk] = useState(false);
  const [applyError, setApplyError] = useState("");

  // ── Load tariffs + delivery rates ──
  useEffect(() => {
    fetch(`${CALC_URL}?action=tariffs`)
      .then(r => r.json()).then(d => {
        const t = JSON.parse(typeof d === "string" ? d : JSON.stringify(d));
        if (t.tariffs?.length) {
          setTariffs(t.tariffs);
          setSelectedTariff(t.tariffs[0]);
        }
      })
      .catch(() => {})
      .finally(() => setTariffsLoading(false));

    fetch(`${CALC_URL}?action=delivery_rates`)
      .then(r => r.json())
      .then(d => { if (d.rates?.length) setDeliveryRates(d.rates); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!showProductSearch || products.length > 0) return;
    setProductsLoading(true);
    fetch(`${CALC_URL}?action=products&company_id=${companyId}`)
      .then(r => r.json()).then(d => {
        const p = JSON.parse(typeof d === "string" ? d : JSON.stringify(d));
        setProducts(p.products || []);
      })
      .catch(() => {})
      .finally(() => setProductsLoading(false));
  }, [showProductSearch, companyId]);

  useEffect(() => {
    if (!initialProduct) return;
    setPurchasePrice(String(initialProduct.our_price));
  }, [initialProduct]);

  // ── Derived values ──
  const purchase = parseFloat(purchasePrice) || 0;

  const earlyPct = earlyMode === "none" ? 0 :
    earlyMode === "ozon_bank"
      ? (selectedTariff?.early_payout_ozon_bank ?? 0.0339)
      : (selectedTariff?.early_payout_standard ?? 0.049);

  const acquiring = selectedTariff?.acquiring_percent ?? 0.019;
  const serviceFee = selectedTariff?.service_fee_fixed ?? 20;
  const logisticsCost = parseFloat(logistics) || 0;

  // База = закупочная × 1.08
  // + стоимость доставки до ТК (только если partner_ozon — мы несём этот расход)
  // При own — клиент платит отдельно, в базу не включаем
  const ownDeliveryInBase = deliveryMode === "own" ? logisticsCost : 0;
  const base = purchase * (1 + PLATFORM_MARKUP) + ownDeliveryInBase;

  const commissionPct = useMemo(() => {
    if (commissionOverride !== "") return parseFloat(commissionOverride) / 100 || 0;
    if (!selectedTariff) return 0.08;
    const roughPrice = purchase > 0 ? purchase * 1.5 : 3000;
    return getCommissionRate(selectedTariff, roughPrice);
  }, [selectedTariff, commissionOverride, purchase]);

  const returnsFrac = returnsPct / 100;
  const adsFrac = adsPct / 100;
  const profitFrac = profitPct / 100;

  // ── Core calculation (два прохода для точного тарифного брекета) ──
  const cardPrice = useMemo(() => {
    if (purchase <= 0) return 0;
    return calcCardPrice(base, profitFrac, earlyPct, commissionPct, returnsFrac, adsFrac, serviceFee);
  }, [base, profitFrac, earlyPct, commissionPct, returnsFrac, adsFrac, serviceFee, purchase]);

  const finalCommissionPct = useMemo(() => {
    if (commissionOverride !== "") return parseFloat(commissionOverride) / 100 || 0;
    if (!selectedTariff || cardPrice <= 0) return commissionPct;
    return getCommissionRate(selectedTariff, cardPrice);
  }, [selectedTariff, cardPrice, commissionOverride, commissionPct]);

  const finalCardPrice = useMemo(() => {
    if (purchase <= 0) return 0;
    return calcCardPrice(base, profitFrac, earlyPct, finalCommissionPct, returnsFrac, adsFrac, serviceFee);
  }, [base, profitFrac, earlyPct, finalCommissionPct, returnsFrac, adsFrac, serviceFee, purchase]);

  // Доставка партнёров Ozon считается от цены карточки
  const partnerDeliveryCost = useMemo(() =>
    deliveryMode === "partner_ozon" ? calcPartnerDeliveryCost(finalCardPrice, deliveryRates) : 0,
    [deliveryMode, finalCardPrice, deliveryRates]
  );
  const totalDeliveryCost = deliveryMode === "own" ? logisticsCost : partnerDeliveryCost;

  // Breakdown
  const commissionAmt  = finalCardPrice * finalCommissionPct;
  const acquiringAmt   = finalCardPrice * acquiring;
  const returnsAmt     = finalCardPrice * returnsFrac;
  const adsAmt         = finalCardPrice * adsFrac;
  const earlyAmt       = finalCardPrice * earlyPct;
  const totalOzonFees  = commissionAmt + acquiringAmt + serviceFee + returnsAmt + adsAmt + earlyAmt;
  const ozonPayout     = finalCardPrice - commissionAmt - acquiringAmt - serviceFee - earlyAmt;
  // Прибыль клиента = цена карточки − все вычеты − доставка − закупочная (уже включает наценку платформы)
  const profit = finalCardPrice - commissionAmt - acquiringAmt - serviceFee
    - returnsAmt - adsAmt - earlyAmt - totalDeliveryCost - purchase;
  const marginPct = purchase > 0 ? (profit / purchase) * 100 : 0;

  const profitColor = profit >= 0 ? "var(--green)" : "var(--rose)";
  const marginColor = marginPct >= 0 ? "var(--green)" : "var(--rose)";

  // ── Product select ──
  const filteredProducts = products.filter(p =>
    p.trade_name.toLowerCase().includes(productQuery.toLowerCase())
  );

  function selectProduct(p: Product) {
    setSelectedProduct(p);
    setPurchasePrice(String(p.purchase_price || ""));
    if (p.package_kg > 0) {
      setLogistics(String(Math.round(calcLogisticsCost(p.package_kg))));
    }
    if (p.category_ozon && tariffs.length > 0) {
      const found = tariffs.find(t =>
        t.category_name.toLowerCase() === p.category_ozon!.toLowerCase()
      );
      if (found) setSelectedTariff(found);
    }
    setShowProductSearch(false);
    setProductQuery("");
  }

  // ── Apply price ──
  async function applyPrice() {
    const productId = selectedProduct?.id;
    if (!productId || finalCardPrice <= 0) return;
    setApplying(true); setApplyOk(false); setApplyError("");
    try {
      const res = await fetch(`${CALC_URL}?action=apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": user?.id || "" },
        body: JSON.stringify({ product_id: productId, price: Math.round(finalCardPrice) }),
      });
      const d = JSON.parse(await res.text());
      if (!res.ok) throw new Error(d.error || "Ошибка");
      setApplyOk(true);
      setTimeout(() => setApplyOk(false), 3000);
    } catch (err: unknown) {
      setApplyError(err instanceof Error ? err.message : "Ошибка");
      setTimeout(() => setApplyError(""), 4000);
    } finally { setApplying(false); }
  }

  // ── Download ──
  function downloadPdf() {
    const lines = [
      `Калькулятор цены карточки Ozon`,
      ``,
      `Товар: ${selectedProduct?.trade_name || "—"}`,
      `Дата: ${new Date().toLocaleDateString("ru")}`,
      ``,
      `=== РЕЗУЛЬТАТ ===`,
      `Цена на Ozon:          ${fmtI(Math.round(finalCardPrice))} ₽`,
      `Выплата от Ozon:       ${fmtI(Math.round(ozonPayout))} ₽`,
      `Ваша прибыль:          ${fmtI(Math.round(profit))} ₽`,
      `Маржа:                 ${marginPct.toFixed(1)}%`,
      `Комиссии Ozon итого:   ${fmtI(Math.round(totalOzonFees))} ₽`,
      ``,
      `=== ДЕТАЛИЗАЦИЯ ===`,
      `Цена на Ozon:          ${fmtI(Math.round(finalCardPrice))} ₽`,
      `− Вознаграждение (${(finalCommissionPct * 100).toFixed(1)}%): ${fmtI(Math.round(commissionAmt))} ₽`,
      `− Эквайринг (1.9%):    ${fmtI(Math.round(acquiringAmt))} ₽`,
      `− Сервисный сбор:      ${serviceFee} ₽`,
      `− Резерв возвраты (${returnsPct}%): ${fmtI(Math.round(returnsAmt))} ₽`,
      `− Реклама (${adsPct}%):  ${fmtI(Math.round(adsAmt))} ₽`,
      `− Логистика:           ${fmtI(totalDeliveryCost)} ₽`,
      earlyPct > 0 ? `− Досрочная выплата (${(earlyPct * 100).toFixed(2)}%): ${fmtI(Math.round(earlyAmt))} ₽` : null,
      `− Закупочная цена:     ${fmtI(purchase)} ₽`,
      `= Ваша прибыль:        ${fmtI(Math.round(profit))} ₽`,
    ].filter(l => l !== null).join("\n");

    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ozon-calc-${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <SectionHeader
        title="Калькулятор цены карточки Ozon"
        subtitle="Рассчитайте цену с учётом всех комиссий и желаемой прибыли"
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ═══ LEFT COLUMN ═══ */}
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
                  <button onClick={() => { setSelectedProduct(null); setPurchasePrice(""); }}
                    className="text-muted-foreground hover:text-foreground">
                    <Icon name="X" size={13} />
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowProductSearch(true)}
                  className="w-full px-3 py-2.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:border-ring hover:text-foreground transition-all text-left flex items-center gap-2">
                  <Icon name="Search" size={13} /> Найти товар из каталога...
                </button>
              )}

              {showProductSearch && (
                <div className="mt-2 rounded-lg border border-border overflow-hidden" style={{ background: "hsl(var(--card))" }}>
                  <div className="p-2 border-b border-border">
                    <input autoFocus type="text" value={productQuery}
                      onChange={e => setProductQuery(e.target.value)}
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
                          <button key={p.id} onClick={() => selectProduct(p)}
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
                    <button onClick={() => setShowProductSearch(false)}
                      className="w-full text-xs text-muted-foreground hover:text-foreground">
                      Закрыть
                    </button>
                  </div>
                </div>
              )}
            </div>

            <NumInput label="Закупочная цена с НДС" value={purchasePrice}
              onChange={setPurchasePrice} suffix="₽" hint="вашa цена" />
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
                      setSelectedTariff(t || null);
                      setCommissionOverride("");
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
                      <button onClick={() => setCommissionOverride("")}
                        className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                        <Icon name="RotateCcw" size={10} />авто
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input type="number"
                      value={commissionOverride !== "" ? commissionOverride : (finalCommissionPct * 100).toFixed(1)}
                      onChange={e => setCommissionOverride(e.target.value)}
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
                onChange={setProfitPct} color="var(--cyan)" />

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
                        onClick={() => setDeliveryMode(opt.id)}
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
                    <input type="number" value={logistics} onChange={e => setLogistics(e.target.value)}
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
                onChange={setReturnsPct} color="var(--amber)" />
              <Slider label="Реклама" value={adsPct} min={0} max={30}
                onChange={setAdsPct} color="var(--violet)" />
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
                <button key={opt.id} onClick={() => setEarlyMode(opt.id as typeof earlyMode)}
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

        {/* ═══ RIGHT COLUMN ═══ */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border p-6 sticky top-4" style={{ background: "hsl(var(--card))" }}>
            {/* Big price */}
            <div className="text-center mb-6">
              <div className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Цена карточки на Ozon</div>
              <div className="font-mono font-bold tracking-tight leading-none"
                style={{ fontSize: "clamp(2rem, 5vw, 3rem)", color: finalCardPrice > 0 ? "hsl(var(--cyan))" : "hsl(var(--muted-foreground))" }}>
                {finalCardPrice > 0 ? `${fmtI(Math.round(finalCardPrice))} ₽` : "— ₽"}
              </div>
              {finalCardPrice > 0 && (
                <div className="text-xs text-muted-foreground mt-1">рекомендуемая цена</div>
              )}
            </div>

            {/* KPI grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[
                { label: "Выплата от Ozon", val: `${fmtI(Math.round(ozonPayout))} ₽`, color: "var(--cyan)", icon: "TrendingUp" },
                { label: "Ваша прибыль", val: `${fmtI(Math.round(profit))} ₽`, color: profitColor, icon: "Banknote" },
                { label: "Маржа", val: `${marginPct.toFixed(1)}%`, color: marginColor, icon: "Percent" },
                { label: "Комиссии Ozon", val: `${fmtI(Math.round(totalOzonFees))} ₽`, color: "var(--amber)", icon: "BarChart2" },
              ].map(k => (
                <div key={k.label} className="rounded-xl p-3" style={{ background: "hsl(var(--secondary))" }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon name={k.icon} size={11} style={{ color: `hsl(${k.color})` }} />
                    <span className="text-[10px] text-muted-foreground">{k.label}</span>
                  </div>
                  <div className="font-mono text-sm font-bold" style={{ color: `hsl(${k.color})` }}>{k.val}</div>
                </div>
              ))}
            </div>

            {/* Detail table */}
            <div className="rounded-xl border border-border p-4 mb-5" style={{ background: "hsl(var(--secondary))" }}>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Детализация</div>
              <Row label="Цена на Ozon" rub={`${fmtI(Math.round(finalCardPrice))} ₽`} minus={false} bold />
              <Row label={`Вознаграждение`} pct={`${(finalCommissionPct * 100).toFixed(1)}%`} rub={`${fmtI(Math.round(commissionAmt))} ₽`} />
              <Row label="Эквайринг" pct="1.9%" rub={`${fmt(acquiringAmt)} ₽`} />
              <Row label="Сервисный сбор" rub="20 ₽" />
              <Row label={`Резерв возвраты`} pct={`${returnsPct}%`} rub={`${fmtI(Math.round(returnsAmt))} ₽`} />
              <Row label="Реклама" pct={`${adsPct}%`} rub={`${fmtI(Math.round(adsAmt))} ₽`} />

              {/* Логистика: клиент видит просто сумму, менеджер — с деталями */}
              {totalDeliveryCost > 0 && (
                managerMode ? (
                  deliveryMode === "own" ? (
                    <Row label="Логистика до ТК" rub={`${fmtI(logisticsCost)} ₽`} />
                  ) : (
                    <Row label="Доставка партнёры Ozon" rub={`${fmtI(partnerDeliveryCost)} ₽`} />
                  )
                ) : (
                  <Row label="Логистика" rub={`${fmtI(totalDeliveryCost)} ₽`} />
                )
              )}

              {earlyPct > 0 && (
                <Row label="Досрочная выплата" pct={`${(earlyPct * 100).toFixed(2)}%`} rub={`${fmtI(Math.round(earlyAmt))} ₽`} />
              )}
              <Row label="Закупочная цена" rub={`${fmtI(purchase)} ₽`} />

              {/* Наценка платформы — только менеджер */}
              {managerMode && (
                <Row label={`Наценка платформы`} pct="8%" rub={`${fmtI(Math.round(purchase * PLATFORM_MARKUP))} ₽`} />
              )}

              <Row label="Ваша прибыль" rub={`${fmtI(Math.round(profit))} ₽`}
                minus={false} bold sep color={profitColor} />
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button onClick={downloadPdf}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border border-border text-foreground hover:bg-secondary transition-all">
                <Icon name="Download" size={15} />
                Скачать расчёт
              </button>

              {managerMode && (
                <button
                  onClick={applyPrice}
                  disabled={applying || !selectedProduct || finalCardPrice <= 0}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                  style={{ background: applyOk ? "hsl(var(--green))" : "hsl(var(--cyan))", color: "hsl(var(--primary-foreground))" }}>
                  {applying
                    ? <><Icon name="Loader2" size={15} className="animate-spin" />Применяю...</>
                    : applyOk
                    ? <><Icon name="CheckCircle" size={15} />Применено!</>
                    : <><Icon name="Check" size={15} />Применить цену</>}
                </button>
              )}
            </div>

            {applyError && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-400">
                <Icon name="AlertCircle" size={12} />{applyError}
              </div>
            )}
            {!managerMode && finalCardPrice > 0 && (
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Для применения цены обратитесь к менеджеру
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Block wrapper ───────────────────────────────────────────────────────────
function Block({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border p-5" style={{ background: "hsl(var(--card))" }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: "hsla(195,90%,48%,0.12)" }}>
          <Icon name={icon} size={13} style={{ color: "hsl(var(--cyan))" }} />
        </div>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}
