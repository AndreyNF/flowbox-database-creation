import { useState, useEffect, useMemo } from "react";
import Icon from "@/components/ui/icon";
import { SectionHeader } from "../shared";
import { getCurrentUser } from "@/lib/auth";
import {
  CALC_URL, PLATFORM_MARKUP,
  Tariff, Product, DeliveryRate, CalcProduct,
  fmt, fmtI,
  calcLogisticsCost, calcPartnerDeliveryCost, getCommissionRate, calcCardPrice,
} from "./CalculatorTypes";
import { Row } from "./CalculatorUI";
import CalculatorLeftColumn from "./CalculatorLeftColumn";

interface Props { initialProduct?: CalcProduct | null; isManager?: boolean; }

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
        <CalculatorLeftColumn
          selectedProduct={selectedProduct}
          purchasePrice={purchasePrice}
          showProductSearch={showProductSearch}
          productQuery={productQuery}
          productsLoading={productsLoading}
          filteredProducts={filteredProducts}
          onProductClear={() => { setSelectedProduct(null); setPurchasePrice(""); }}
          onProductSearchOpen={() => setShowProductSearch(true)}
          onProductSearchClose={() => setShowProductSearch(false)}
          onProductQueryChange={setProductQuery}
          onProductSelect={selectProduct}
          onPurchasePriceChange={setPurchasePrice}
          tariffs={tariffs}
          tariffsLoading={tariffsLoading}
          selectedTariff={selectedTariff}
          commissionOverride={commissionOverride}
          finalCardPrice={finalCardPrice}
          finalCommissionPct={finalCommissionPct}
          managerMode={managerMode}
          onTariffChange={setSelectedTariff}
          onCommissionOverrideChange={setCommissionOverride}
          onCommissionOverrideClear={() => setCommissionOverride("")}
          profitPct={profitPct}
          returnsPct={returnsPct}
          adsPct={adsPct}
          onProfitChange={setProfitPct}
          onReturnsChange={setReturnsPct}
          onAdsChange={setAdsPct}
          deliveryMode={deliveryMode}
          logistics={logistics}
          partnerDeliveryCost={partnerDeliveryCost}
          onDeliveryModeChange={setDeliveryMode}
          onLogisticsChange={setLogistics}
          earlyMode={earlyMode}
          onEarlyModeChange={setEarlyMode}
        />

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
