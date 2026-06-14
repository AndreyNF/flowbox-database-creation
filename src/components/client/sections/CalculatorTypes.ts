export const CALC_URL = "https://functions.poehali.dev/1be91c0d-825b-4a5f-9488-4a1833027306";

export const PLATFORM_MARKUP = 0.08; // 8% — наценка платформы, скрыта от клиента

export interface Tariff {
  id: string; category_name: string; product_type: string;
  commission_lt_1500: number; commission_1500_5000: number;
  commission_5000_10000: number; commission_gt_10000: number;
  acquiring_percent: number; service_fee_fixed: number;
  early_payout_standard: number; early_payout_ozon_bank: number;
}

export interface Product {
  id: string; trade_name: string; purchase_price: number;
  package_kg: number; our_price: number | null; category_ozon: string | null;
}

export interface DeliveryRate {
  price_from: number; price_to: number | null; cost: number;
}

export interface CalcProduct { id: string; trade_name: string; our_price: number; }

export function fmt(n: number): string {
  return n.toLocaleString("ru", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export function fmtI(n: number): string {
  return n.toLocaleString("ru", { maximumFractionDigits: 0 });
}

export function calcLogisticsCost(packageKg: number): number {
  if (packageKg <= 0) return 0;
  if (packageKg <= 100) return 600;
  return 600 + (packageKg - 100) * 2.5;
}

export function calcPartnerDeliveryCost(orderPrice: number, rates: DeliveryRate[]): number {
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

export function getCommissionRate(tariff: Tariff, price: number): number {
  if (price < 1500)  return tariff.commission_lt_1500;
  if (price < 5000)  return tariff.commission_1500_5000;
  if (price < 10000) return tariff.commission_5000_10000;
  return tariff.commission_gt_10000;
}

// База = purchase × 1.08 + delivery_to_tc (только если partner_ozon, иначе 0)
// X = База × (1 + profit%)
//     ÷ (1 - early%)
//     ÷ (1 - commission% - 0.019 - returns% - ads%)
//   + service_fee
// Доставка партнёров Ozon считается от цены карточки (итерация)
export function calcCardPrice(
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
