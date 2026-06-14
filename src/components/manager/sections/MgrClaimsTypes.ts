export const COMP_TYPES = ["money", "part_replacement", "back_to_stock", "write_off", "return_to_supplier"];

export const COMP_LABELS: Record<string, string> = {
  money: "Денежная", part_replacement: "Замена детали",
  back_to_stock: "Возврат на склад", write_off: "Списание",
  return_to_supplier: "Возврат поставщику",
};

export const CLAIM_TYPES_CREATE = ["defect", "damage", "return", "delivery_refusal"];

export const WAREHOUSE_STATUS: Record<string, { l: string; c: string }> = {
  in_warehouse:      { l: "На складе",              c: "text-amber-400" },
  ready_for_sale:    { l: "Готов к продаже",         c: "text-green-400" },
  ready_for_return:  { l: "К возврату поставщику",   c: "text-violet-400" },
  written_off:       { l: "Списан",                  c: "text-muted-foreground" },
};
