export type Section = "tasks" | "route" | "history";

export interface Order {
  id: string; order_number: string; product_name: string;
  quantity: number; total_amount: number; company_name?: string;
}

export interface RoutePoint {
  type: "pickup" | "delivery"; address: string; name?: string;
  lat?: number; lon?: number; delivery_id?: string;
}

export interface Delivery {
  id: string;
  type: string;
  delivery_method: string;
  fulfillment_scheme: string;
  rfbs_subtype: string;
  route_points: RoutePoint[] | null;
  total_boxes: number;
  labels_pdf: string | null;
  act_pdf: string | null;
  transfer_act_pdf: string | null;
  ttn_id: string | null;
  tracking_number: string | null;
  status: string;
  reject_reason: string | null;
  task_date: string;
  shipped_at: string | null;
  delivered_at: string | null;
  supplier_name: string | null;
  supplier_warehouse_address: string | null;
  supplier_pickup_hours: string | null;
  orders: Order[];
  orders_count?: number;
}

export const DELIVERY_TYPES: Record<string, string> = {
  to_buyer:             "К покупателю",
  to_tc:                "До ТК",
  return_from_buyer:    "Возврат от покупателя",
  return_to_supplier:   "Возврат поставщику",
};

export const STATUS_LABELS: Record<string, { l: string; c: string; bg: string }> = {
  new:                  { l: "Новое",                c: "text-muted-foreground", bg: "bg-secondary" },
  picked_from_supplier: { l: "Забран у поставщика",  c: "text-blue-400",        bg: "bg-blue-400/10" },
  in_transit:           { l: "В дороге",             c: "text-amber-400",       bg: "bg-amber-400/10" },
  handed_to_tc:         { l: "Сдан в ТК",            c: "text-violet-400",      bg: "bg-violet-400/10" },
  delivered:            { l: "Доставлен",            c: "text-green-400",       bg: "bg-green-400/10" },
  refused:              { l: "Отказ",                c: "text-rose-400",        bg: "bg-rose-400/10" },
};

export const METHOD_LABELS: Record<string, string> = {
  own:            "Наша служба",
  ozon_partner_tc:"Партнёры Ozon",
  third_party_tc: "Сторонняя ТК",
};

export function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "₽ " + Number(n).toLocaleString("ru", { maximumFractionDigits: 0 });
}

export function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "numeric" });
}
